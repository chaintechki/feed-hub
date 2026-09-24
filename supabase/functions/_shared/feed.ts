import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export type Client = {
  id: string;
  name: string;
  active: boolean;
  sport_ids: string[];
  tournament_ids: string[];
  markup_pct: number;
  rate_limit_per_min: number;
  allowed_domains: string[];
  formats: string[];
};

export const db = (): SupabaseClient =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

export async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function resolveKey(sb: SupabaseClient, key: string | null, kind: "server" | "widget") {
  if (!key || key.length < 20 || key.length > 100) return null;
  const hash = await sha256(key);
  const { data } = await sb
    .from("api_keys")
    .select("id,kind,active,api_clients(*)")
    .eq("key_hash", hash)
    .maybeSingle();
  if (!data || !data.active || data.kind !== kind) return null;
  const client = data.api_clients as unknown as Client;
  if (!client?.active) return null;
  void sb.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  return client;
}

export async function overLimit(sb: SupabaseClient, c: Client, endpoint: string) {
  const { data } = await sb.rpc("api_track", { _client: c.id, _endpoint: endpoint, _limit: c.rate_limit_per_min });
  return (data as number) > c.rate_limit_per_min;
}

type Outcome = { label?: string; name?: string; odds: number };
export const applyMarkup = (odds: number, pct: number) =>
  Math.max(1.01, Math.round((odds / (1 + (Number(pct) || 0) / 100)) * 100) / 100);

function scope<T extends { eq: any; in: any }>(q: T, c: Client, sportCol = "sport_id", tourCol = "tournament_id"): T {
  let r: any = q;
  if (c.sport_ids.length) r = r.in(sportCol, c.sport_ids);
  if (c.tournament_ids.length) r = r.in(tourCol, c.tournament_ids);
  return r;
}

export async function getSports(sb: SupabaseClient, c: Client) {
  let s = sb.from("sports").select("id,name").order("sort_order");
  if (c.sport_ids.length) s = s.in("id", c.sport_ids);
  let cat = sb.from("categories").select("id,sport_id,name,country_code");
  if (c.sport_ids.length) cat = cat.in("sport_id", c.sport_ids);
  let t = sb.from("tournaments").select("id,category_id,sport_id,name");
  t = scope(t, c, "sport_id", "id");
  const [a, b, d] = await Promise.all([s, cat, t]);
  const tours = d.data ?? [];
  const catIds = new Set(tours.map((x) => x.category_id));
  return (a.data ?? []).map((sp) => ({
    ...sp,
    categories: (b.data ?? [])
      .filter((x) => x.sport_id === sp.id && (!c.tournament_ids.length || catIds.has(x.id)))
      .map((x) => ({ ...x, tournaments: tours.filter((y) => y.category_id === x.id) })),
  }));
}

export async function getMatches(sb: SupabaseClient, c: Client, opts: { id?: string; sport?: string; withOdds?: boolean }) {
  let q = sb
    .from("matches")
    .select("id,sport_id,category_id,tournament_id,home_team,away_team,scheduled,status,match_minute,suspended")
    .order("scheduled")
    .limit(500);
  q = scope(q, c);
  if (opts.id) q = q.eq("id", opts.id);
  if (opts.sport) q = q.eq("sport_id", opts.sport);
  const { data: matches } = await q;
  const list = matches ?? [];
  if (!opts.withOdds || !list.length) return list.map((m) => ({ ...m, markets: [] }));
  const { data: odds } = await sb
    .from("match_odds")
    .select("match_id,market,specifier,outcomes,updated_at")
    .eq("source", "own")
    .in("match_id", list.map((m) => m.id));
  return list.map((m) => ({
    ...m,
    markets: (odds ?? [])
      .filter((o) => o.match_id === m.id)
      .map((o) => ({
        market: o.market,
        specifier: o.specifier,
        updated_at: o.updated_at,
        active: !m.suspended,
        outcomes: ((o.outcomes as Outcome[]) ?? []).map((x) => ({
          id: x.label ?? x.name,
          odds: applyMarkup(x.odds, c.markup_pct),
        })),
      })),
  }));
}

export async function getOutrights(sb: SupabaseClient, c: Client) {
  let q = sb.from("outrights").select("id,tournament_id,name,scheduled,status,competitors,tournaments!inner(sport_id)");
  if (c.tournament_ids.length) q = q.in("tournament_id", c.tournament_ids);
  if (c.sport_ids.length) q = q.in("tournaments.sport_id", c.sport_ids);
  const { data } = await q;
  return (data ?? []).map(({ tournaments: _t, ...o }: any) => ({
    ...o,
    competitors: ((o.competitors as Outcome[]) ?? []).map((x) => ({
      name: x.name,
      odds: applyMarkup(x.odds, c.markup_pct),
    })),
  }));
}

export async function getResults(sb: SupabaseClient, c: Client) {
  let q = sb
    .from("settlements")
    .select("match_id,market,specifier,outcome,settled_at,matches!inner(sport_id,tournament_id)")
    .eq("state", "settled")
    .order("settled_at", { ascending: false })
    .limit(500);
  if (c.sport_ids.length) q = q.in("matches.sport_id", c.sport_ids);
  if (c.tournament_ids.length) q = q.in("matches.tournament_id", c.tournament_ids);
  const { data } = await q;
  return (data ?? []).map(({ matches: _m, ...r }: any) => r);
}

/* ---------- XML (Betradar-like structure) ---------- */
const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[ch]!);
const attrs = (o: Record<string, unknown>) =>
  Object.entries(o)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => ` ${k}="${esc(v)}"`)
    .join("");
const ts = () => Date.now();

export function toXml(kind: string, data: any[]): string {
  const head = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  if (kind === "sports")
    return head + `<sports generated_at="${ts()}">` + data.map((s) =>
      `<sport${attrs({ id: s.id, name: s.name })}>` + s.categories.map((c: any) =>
        `<category${attrs({ id: c.id, name: c.name, country_code: c.country_code })}>` +
        c.tournaments.map((t: any) => `<tournament${attrs({ id: t.id, name: t.name })}/>`).join("") +
        `</category>`).join("") + `</sport>`).join("") + `</sports>`;
  if (kind === "matches" || kind === "odds")
    return head + `<odds_change_list generated_at="${ts()}">` + data.map((m) =>
      `<sport_event${attrs({ id: m.id, scheduled: m.scheduled, status: m.status, match_minute: m.match_minute, sport_id: m.sport_id, category_id: m.category_id, tournament_id: m.tournament_id })}>` +
      `<competitors><competitor qualifier="home"${attrs({ name: m.home_team })}/><competitor qualifier="away"${attrs({ name: m.away_team })}/></competitors>` +
      (m.markets.length ? `<odds>` + m.markets.map((mk: any) =>
        `<market${attrs({ id: mk.market, specifiers: mk.specifier, status: mk.active ? 1 : -1 })}>` +
        mk.outcomes.map((o: any) => `<outcome${attrs({ id: o.id, odds: o.odds, active: mk.active ? 1 : 0 })}/>`).join("") +
        `</market>`).join("") + `</odds>` : "") + `</sport_event>`).join("") + `</odds_change_list>`;
  if (kind === "outrights")
    return head + `<outrights generated_at="${ts()}">` + data.map((o) =>
      `<outright${attrs({ id: o.id, tournament_id: o.tournament_id, name: o.name, scheduled: o.scheduled, status: o.status })}>` +
      o.competitors.map((c: any) => `<outcome${attrs({ name: c.name, odds: c.odds })}/>`).join("") + `</outright>`).join("") + `</outrights>`;
  return head + `<bet_settlement_list generated_at="${ts()}">` + data.map((r) =>
    `<bet_settlement${attrs({ event_id: r.match_id, settled_at: r.settled_at })}><market${attrs({ id: r.market, specifiers: r.specifier })}><outcome${attrs({ id: r.outcome, result: 1 })}/></market></bet_settlement>`).join("") + `</bet_settlement_list>`;
}
