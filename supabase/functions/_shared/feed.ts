import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { catalog, knownOutcomeTemplate, marketDisplayName, marketKeyOf, resolveTemplate, specString, uofIdOf } from "./markets.ts";
import { ERROR_CODES, ipAllowed, isExpired, priceOdds, type ErrorCode, type RoundingMode } from "./api-core.ts";
export { ERROR_CODES, buildOpenApi, clientIp, type ErrorCode } from "./api-core.ts";

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
  market_groups?: string[];
};

export const db = (): SupabaseClient =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

export async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type KeyInfo = { id: string; expires_at: string | null };
export type Resolved = { ok: true; client: Client; key: KeyInfo } | { ok: false; code: ErrorCode; client: Client | null };

export async function resolveKey(sb: SupabaseClient, key: string | null, kind: "server" | "widget", ip: string | null = null): Promise<Resolved> {
  if (!key) return { ok: false, code: "key_missing", client: null };
  if (key.length < 20 || key.length > 100) return { ok: false, code: "invalid_key", client: null };
  const hash = await sha256(key);
  const { data } = await sb
    .from("api_keys")
    .select("id,kind,active,expires_at,allowed_ips,api_clients(*)")
    .eq("key_hash", hash)
    .maybeSingle();
  if (!data || !data.active || data.kind !== kind) return { ok: false, code: "invalid_key", client: null };
  const client = data.api_clients as unknown as Client;
  if (!client?.active) return { ok: false, code: "invalid_key", client: null };
  if (isExpired(data.expires_at)) return { ok: false, code: "key_expired", client };
  if (kind === "server" && !ipAllowed(ip, data.allowed_ips ?? [])) return { ok: false, code: "ip_denied", client };
  void sb.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id).then(() => {}, () => {});
  return { ok: true, client, key: { id: data.id, expires_at: data.expires_at } };
}

/** Live rounding mode from feed options (cached 60 s per instance). */
let rounding: { at: number; mode: RoundingMode } | null = null;
export async function roundingMode(sb: SupabaseClient): Promise<RoundingMode> {
  if (rounding && Date.now() - rounding.at < 60_000) return rounding.mode;
  const { data } = await sb.from("feed_options").select("options").eq("scope", "live").maybeSingle();
  const mode = ((data?.options as Record<string, unknown> | null)?.rounding as RoundingMode) ?? "none";
  rounding = { at: Date.now(), mode };
  return mode;
}

/** Uniform error body: JSON `{error:{code,message}}` or XML `<error code="">`. */
export function errorBody(code: ErrorCode, xml = false, detail?: string) {
  const [status, msg] = ERROR_CODES[code];
  const message = detail ? `${msg} ${detail}` : msg;
  return xml
    ? { status, type: "application/xml; charset=utf-8", body: `<?xml version="1.0" encoding="UTF-8"?>\n<error code="${code}">${esc(message)}</error>` }
    : { status, type: "application/json; charset=utf-8", body: JSON.stringify({ error: { code, message } }) };
}

/** Proxies may weaken ETags (W/"…"); compare the opaque part. */
export const etagMatches = (header: string | null, etag: string) =>
  !!header && header.split(",").some((h) => h.trim().replace(/^W\//, "") === etag.replace(/^W\//, ""));

export async function etagOf(body: string) {
  // Content hash without volatile generation timestamps → stable across instances/rebuilds.
  const stable = body.replace(/"generated_at":"[^"]*"/g, "").replace(/generated_at="\d+"/g, "");
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(stable));
  return `"${Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("")}"`;
}

export async function overLimit(sb: SupabaseClient, c: Client, endpoint: string) {
  const { data } = await sb.rpc("api_track", { _client: c.id, _endpoint: endpoint, _limit: c.rate_limit_per_min });
  const used = Number(data) || 0;
  const reset = Math.floor(Date.now() / 60000) * 60 + 60;
  return { limited: used > c.rate_limit_per_min, limit: c.rate_limit_per_min, remaining: Math.max(0, c.rate_limit_per_min - used), reset };
}
export type RateInfo = Awaited<ReturnType<typeof overLimit>>;
export const rateHeaders = (r: RateInfo): Record<string, string> => ({
  "X-RateLimit-Limit": String(r.limit),
  "X-RateLimit-Remaining": String(r.remaining),
  "X-RateLimit-Reset": String(r.reset),
  ...(r.limited ? { "Retry-After": String(Math.max(1, r.reset - Math.floor(Date.now() / 1000))) } : {}),
});

/** Fire-and-forget logging of a denied request (401/403/404/429). Never blocks the response. */
export async function trackDenial(
  sb: SupabaseClient,
  client: Client | null,
  key: string | null,
  endpoint: string,
  reason: ErrorCode,
) {
  void sb
    .rpc("api_track_denial", {
      _client: client?.id ?? null,
      _key_hint: key ? key.slice(0, 14) : "",
      _endpoint: endpoint,
      _reason: reason,
    })
    .then(() => {}, () => {});
}

type Outcome = { label?: string; name?: string; odds: number };
export const applyMarkup = (odds: number, pct: number, mode: RoundingMode = "none") => priceOdds(odds, pct, mode);

const CHUNK = 150;
const chunks = <T,>(xs: T[], n = CHUNK): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
};
function must<T>(r: { data: T | null; error: unknown; count?: number | null }): { data: T; count: number | null } {
  if (r.error) throw new Error(`query_failed: ${(r.error as { message?: string }).message ?? String(r.error)}`);
  return { data: (r.data ?? []) as T, count: r.count ?? null };
}

type Scope = { sports: string[]; tours: string[] };
const scopeCache = new Map<string, { at: number; s: Scope }>();
/** Normalizes a client's release: full releases become "no filter"; tournament filter makes the sport filter redundant. */
async function effectiveScope(sb: SupabaseClient, c: Client): Promise<Scope> {
  const key = `${c.id}|${c.sport_ids.length}|${c.tournament_ids.length}|${c.sport_ids.join(",")}|${c.tournament_ids.join(",")}`;
  const hit = scopeCache.get(key);
  if (hit && Date.now() - hit.at < 300_000) return hit.s;
  let sports = [...new Set(c.sport_ids)];
  let tours = [...new Set(c.tournament_ids)];
  if (sports.length) {
    const { count } = must(await sb.from("sports").select("id", { count: "exact", head: true }));
    if (count !== null && sports.length >= count) sports = [];
  }
  if (tours.length) {
    let total = 0;
    if (sports.length) {
      for (const part of chunks(sports)) total += must(await sb.from("tournaments").select("id", { count: "exact", head: true }).in("sport_id", part)).count ?? 0;
    } else total = must(await sb.from("tournaments").select("id", { count: "exact", head: true })).count ?? Infinity;
    if (tours.length >= total) tours = [];
  }
  const s = { sports, tours };
  scopeCache.set(key, { at: Date.now(), s });
  if (scopeCache.size > 500) scopeCache.clear();
  return s;
}
/** Picks the single narrowest filter (column + id list), or null for full release. */
function scopeFilter(s: Scope, sportCol: string, tourCol: string): { col: string; ids: string[] } | null {
  if (s.tours.length) return { col: tourCol, ids: s.tours };
  if (s.sports.length) return { col: sportCol, ids: s.sports };
  return null;
}
/** Runs `build` once per id chunk (or once without filter) and concatenates rows. */
async function scoped<R>(f: { col: string; ids: string[] } | null, build: (ids: string[] | null) => PromiseLike<{ data: R[] | null; error: unknown; count?: number | null }>) {
  const parts = f ? chunks(f.ids) : [null];
  const res = await Promise.all(parts.map((ids) => build(ids)));
  let count = 0;
  const rows: R[] = [];
  for (const r of res) { const m = must(r); rows.push(...m.data); count += m.count ?? m.data.length; }
  return { rows, count };
}

export async function getSports(sb: SupabaseClient, c: Client) {
  const sc = await effectiveScope(sb, c);
  const sportF = sc.sports.length ? { col: "id", ids: sc.sports } : null;
  const catF = sc.sports.length ? { col: "sport_id", ids: sc.sports } : null;
  const tourF = scopeFilter(sc, "sport_id", "id");
  const [a, b, d] = await Promise.all([
    scoped(sportF, (ids) => { const q = sb.from("sports").select("id,name,sort_order"); return ids ? q.in("id", ids) : q; }),
    scoped(catF, (ids) => { const q = sb.from("categories").select("id,sport_id,name,country_code"); return ids ? q.in("sport_id", ids) : q; }),
    scoped(tourF, (ids) => { const q = sb.from("tournaments").select("id,category_id,sport_id,name"); return ids ? q.in(tourF!.col, ids) : q; }),
  ]);
  const tours = d.rows as { id: string; category_id: string; sport_id: string; name: string }[];
  const catIds = new Set(tours.map((x) => x.category_id));
  const sportIds = sc.tours.length ? new Set(tours.map((x) => x.sport_id)) : null;
  return (a.rows as { id: string; name: string; sort_order: number }[])
    .filter((sp) => !sportIds || sportIds.has(sp.id))
    .sort((x, y) => x.sort_order - y.sort_order)
    .map(({ sort_order: _o, ...sp }) => ({
      ...sp,
      categories: (b.rows as { id: string; sport_id: string; name: string; country_code: string | null }[])
        .filter((x) => x.sport_id === sp.id && (!sc.tours.length || catIds.has(x.id)))
        .map((x) => ({ ...x, tournaments: tours.filter((y) => y.category_id === x.id) })),
    }));
}

export type MatchOpts = {
  id?: string | undefined;
  sport?: string | undefined;
  tournament?: string | undefined;
  status?: string | undefined;
  since?: string | undefined;
  withOdds?: boolean;
  limit?: number;
  offset?: number;
  rounding?: RoundingMode;
  groups?: string[] | undefined;
  lang?: "en" | "de";
};
export async function getMatches(sb: SupabaseClient, c: Client, opts: MatchOpts) {
  const limit = opts.limit ?? 500;
  const offset = opts.offset ?? 0;
  const sc = await effectiveScope(sb, c);
  const f = scopeFilter(sc, "sport_id", "tournament_id");
  const multi = !!f && f.ids.length > CHUNK;
  const res = await scoped(f, (ids) => {
    let q: any = sb
      .from("matches")
      .select("id,sport_id,category_id,tournament_id,home_team,away_team,scheduled,status,match_minute,suspended,updated_at", { count: "exact" })
      .order("scheduled")
      .order("id")
      .range(multi ? 0 : offset, offset + limit - 1);
    if (ids) q = q.in(f!.col, ids);
    if (opts.id) q = q.eq("id", opts.id);
    if (opts.sport) q = q.eq("sport_id", opts.sport);
    if (opts.tournament) q = q.eq("tournament_id", opts.tournament);
    if (opts.status) q = q.eq("status", opts.status);
    if (opts.since) q = q.gte("updated_at", opts.since);
    return q;
  });
  type M = { id: string; scheduled: string; suspended: boolean; home_team: string; away_team: string } & Record<string, unknown>;
  let matches = res.rows as M[];
  if (multi) {
    matches.sort((x, y) => (x.scheduled < y.scheduled ? -1 : x.scheduled > y.scheduled ? 1 : x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
    matches = matches.slice(offset, offset + limit);
  }
  const list = matches.map(({ suspended, ...m }) => ({ ...m, _susp: suspended as boolean }));
  const total = res.count;
  if (!opts.withOdds || !list.length) return { total, rows: list.map(({ _susp, ...m }) => ({ ...m, markets: [] as unknown[] })) };
  const oddsRes = await scoped({ col: "match_id", ids: list.map((m) => m.id) }, (ids) =>
    sb
      .from("match_odds")
      .select("match_id,market,specifier,outcomes,updated_at,suspended,market_group")
      .eq("source", "own")
      .eq("suspended", false)
      .in("match_id", ids!),
  );
  const odds = oddsRes.rows as { match_id: string; market: string; specifier: string | null; outcomes: unknown; updated_at: string; market_group: string }[];
  const allowed = (c.market_groups ?? []).length ? new Set(c.market_groups) : null;
  const wanted = opts.groups?.length ? new Set(opts.groups) : null;
  const cat = await catalog(sb).catch(() => new Map());
  const de = opts.lang === "de";
  return {
    total,
    rows: list.map(({ _susp, ...m }) => ({
      ...m,
      markets: odds
        .filter((o) => o.match_id === m.id && (!allowed || allowed.has(o.market_group)) && (!wanted || wanted.has(o.market_group)))
        .map((o) => {
          const uid = uofIdOf(o.market);
          const ce = uid ? cat.get(uid) : undefined;
          const spec = specString(o.market, o.specifier);
          const outNames = new Map<string, string>(((de && ce?.outcomes_de) || ce?.outcomes || []).map((x: { id: string; name: string }) => [x.id, x.name]));
          return {
            market: o.market,
            uof_id: uid,
            name: ce ? marketDisplayName((de && ce.name_de) || ce.name, spec, m.home_team, m.away_team) : o.market,
            group: o.market_group,
            specifier: o.specifier,
            updated_at: o.updated_at,
            active: !_susp,
            outcomes: ((o.outcomes as Outcome[]) ?? [])
              .filter((x) => typeof x.odds === "number" && x.odds > 1)
              .map((x) => {
                const id = String(x.label ?? x.name);
                const raw = knownOutcomeTemplate(o.market, id, de) ?? outNames.get(id);
                return { id, name: raw ? resolveTemplate(raw, spec, m.home_team, m.away_team) : id, odds: applyMarkup(x.odds, c.markup_pct, opts.rounding) };
              }),
          };
        }),
    })),
  };
}

/** Market catalog for customers (base variants only). */
export async function getMarkets(sb: SupabaseClient, c: Client, lang: "en" | "de" = "en") {
  const cat = await catalog(sb);
  const allowed = (c.market_groups ?? []).length ? new Set(c.market_groups) : null;
  return [...cat.values()]
    .filter((m) => !allowed || allowed.has(m.group))
    .sort((a, b) => a.id - b.id)
    .map((m) => ({
      uof_id: m.id,
      market: marketKeyOf(m.id),
      name: (lang === "de" && m.name_de) || m.name,
      group: m.group,
      specifiers: m.specifiers ? m.specifiers.split("|") : [],
      outcomes: ((lang === "de" && m.outcomes_de) || m.outcomes).map((o) => ({ id: o.id, name: o.name })),
    }));
}

export async function getOutrights(sb: SupabaseClient, c: Client, rounding: RoundingMode = "none") {
  const sc = await effectiveScope(sb, c);
  const f = scopeFilter(sc, "tournaments.sport_id", "tournament_id");
  const { rows } = await scoped(f, (ids) => {
    const q = sb.from("outrights").select("id,tournament_id,name,scheduled,status,competitors,tournaments!inner(sport_id)").eq("suspended", false);
    return ids ? q.in(f!.col, ids) : q;
  });
  return rows.map(({ tournaments: _t, ...o }: any) => ({
    ...o,
    competitors: ((o.competitors as Outcome[]) ?? []).map((x) => ({
      name: x.name,
      odds: applyMarkup(x.odds, c.markup_pct, rounding),
    })),
  }));
}

export async function getResults(sb: SupabaseClient, c: Client) {
  const sc = await effectiveScope(sb, c);
  const f = scopeFilter(sc, "matches.sport_id", "matches.tournament_id");
  const { rows } = await scoped(f, (ids) => {
    const q = sb
      .from("settlements")
      .select("match_id,market,specifier,outcome,settled_at,matches!inner(sport_id,tournament_id)")
      .eq("state", "settled")
      .order("settled_at", { ascending: false })
      .limit(500);
    return ids ? q.in(f!.col, ids) : q;
  });
  return (rows as any[])
    .sort((x, y) => String(y.settled_at).localeCompare(String(x.settled_at)))
    .slice(0, 500)
    .map(({ matches: _m, ...r }: any) => r);
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

export function toXml(kind: string, data: any[], meta?: Record<string, number>): string {
  const head = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  if (kind === "sports")
    return head + `<sports generated_at="${ts()}">` + data.map((s) =>
      `<sport${attrs({ id: s.id, name: s.name })}>` + s.categories.map((c: any) =>
        `<category${attrs({ id: c.id, name: c.name, country_code: c.country_code })}>` +
        c.tournaments.map((t: any) => `<tournament${attrs({ id: t.id, name: t.name })}/>`).join("") +
        `</category>`).join("") + `</sport>`).join("") + `</sports>`;
  if (kind === "matches" || kind === "odds")
    return head + `<odds_change_list generated_at="${ts()}"${meta ? attrs(meta) : ""}>` + data.map((m) =>
      `<sport_event${attrs({ id: m.id, scheduled: m.scheduled, status: m.status, match_minute: m.match_minute, sport_id: m.sport_id, category_id: m.category_id, tournament_id: m.tournament_id })}>` +
      `<competitors><competitor qualifier="home"${attrs({ name: m.home_team })}/><competitor qualifier="away"${attrs({ name: m.away_team })}/></competitors>` +
      (m.markets.length ? `<odds>` + m.markets.map((mk: any) =>
        `<market${attrs({ id: mk.market, uof_id: mk.uof_id, name: mk.name, group: mk.group, specifiers: mk.specifier, status: mk.active ? 1 : -1 })}>` +
        mk.outcomes.map((o: any) => `<outcome${attrs({ id: o.id, name: o.name, odds: o.odds, active: mk.active ? 1 : 0 })}/>`).join("") +
        `</market>`).join("") + `</odds>` : "") + `</sport_event>`).join("") + `</odds_change_list>`;
  if (kind === "markets")
    return head + `<market_descriptions generated_at="${ts()}">` + data.map((m) =>
      `<market${attrs({ id: m.market, uof_id: m.uof_id, name: m.name, group: m.group, specifiers: m.specifiers.join("|") || null })}>` +
      m.outcomes.map((o: any) => `<outcome${attrs({ id: o.id, name: o.name })}/>`).join("") + `</market>`).join("") + `</market_descriptions>`;
  if (kind === "outrights")
    return head + `<outrights generated_at="${ts()}">` + data.map((o) =>
      `<outright${attrs({ id: o.id, tournament_id: o.tournament_id, name: o.name, scheduled: o.scheduled, status: o.status })}>` +
      o.competitors.map((c: any) => `<outcome${attrs({ name: c.name, odds: c.odds })}/>`).join("") + `</outright>`).join("") + `</outrights>`;
  return head + `<bet_settlement_list generated_at="${ts()}">` + data.map((r) =>
    `<bet_settlement${attrs({ event_id: r.match_id, settled_at: r.settled_at })}><market${attrs({ id: r.market, specifiers: r.specifier })}><outcome${attrs({ id: r.outcome, result: 1 })}/></market></bet_settlement>`).join("") + `</bet_settlement_list>`;
}

/* ---------- Per-instance response cache (15 s) ---------- */
const CACHE_TTL = 15_000;
const cache = new Map<string, { at: number; body: string; etag: string }>();

export async function cached(key: string, build: () => Promise<string | null>) {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_TTL) return { body: hit.body, etag: hit.etag, hit: true };
  const body = await build();
  let etag = "";
  if (body !== null) {
    etag = await etagOf(body);
    if (cache.size > 500) for (const [k, v] of cache) if (now - v.at >= CACHE_TTL) cache.delete(k);
    cache.set(key, { at: now, body, etag });
  }
  return { body, etag, hit: false };
}

/** Fire-and-forget: records cache hit + response bytes for cost reporting. */
export function trackMeta(sb: SupabaseClient, c: Client, endpoint: string, hit: boolean, body: string) {
  void sb
    .rpc("api_track_meta", { _client: c.id, _endpoint: endpoint, _cache_hit: hit, _bytes: new TextEncoder().encode(body).length })
    .then(() => {}, () => {});
}

export const clientScopeKey = (c: Client) =>
  `${c.id}|${c.markup_pct}|${c.sport_ids.join(",")}|${c.tournament_ids.join(",")}|${(c.market_groups ?? []).join(",")}`;
