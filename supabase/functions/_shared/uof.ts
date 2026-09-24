import { XMLParser } from "npm:fast-xml-parser@4";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  isArray: (name) => ["sport", "sport_event", "competitor", "market", "outcome", "producer", "category", "tournament", "specifier"].includes(name),
});

const host = () => Deno.env.get("UOF_API_HOST") ?? "";
const token = () => Deno.env.get("UOF_ACCESS_TOKEN") ?? "";

export async function uofGet(path: string) {
  const r = await fetch(`https://${host()}/v1${path}`, { headers: { "x-access-token": token() } });
  if (!r.ok) throw new Error(`upstream ${r.status} ${path}`);
  return parser.parse(await r.text());
}

/** HMAC-SHA256 hex, keyed with the feed access token (shared with the worker). */
export async function hmac(data: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(token()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
export async function verifySigned(req: Request, body: string) {
  const ts = Number(req.headers.get("x-uof-ts"));
  const sig = req.headers.get("x-uof-sig") ?? "";
  if (!ts || Math.abs(Date.now() - ts) > 120_000 || !token()) return false;
  const want = await hmac(`${ts}.${body}`);
  if (want.length !== sig.length) return false;
  let d = 0;
  for (let i = 0; i < want.length; i++) d |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  return d === 0;
}

// ---- market mapping (UOF market id → panel market) ----
type Map_ = { market: string; group: string; spec?: string; outcomes: Record<string, string> };
export const MARKET_MAP: Record<number, Map_> = {
  1: { market: "1x2", group: "main", outcomes: { "1": "1", "2": "X", "3": "2" } },
  18: { market: "total", group: "main", spec: "total", outcomes: { "12": "Over", "13": "Under" } },
  16: { market: "handicap", group: "main", spec: "hcp", outcomes: { "1714": "1", "1715": "2" } },
  10: { market: "double_chance", group: "goals", outcomes: { "9": "1X", "10": "12", "11": "X2" } },
  29: { market: "btts", group: "goals", outcomes: { "74": "Yes", "76": "No" } },
  60: { market: "ht_1x2", group: "half", outcomes: { "1": "1", "2": "X", "3": "2" } },
  68: { market: "ht_total", group: "half", spec: "total", outcomes: { "12": "Over", "13": "Under" } },
  186: { market: "1x2", group: "main", outcomes: { "4": "1", "5": "2" } }, // winner (tennis etc.)
  219: { market: "1x2", group: "main", outcomes: { "4": "1", "5": "2" } }, // winner incl. OT
};

export function mapMarket(id: number, specifiers?: string) {
  const m = MARKET_MAP[id];
  const specs = Object.fromEntries((specifiers ?? "").split("|").filter(Boolean).map((s) => s.split("=") as [string, string]));
  if (!m) return { market: `m${id}`, group: "other", specifier: specifiers || null, label: (o: string) => o };
  if (m.spec && !specs[m.spec]) return null;
  if (!m.spec && specifiers && id !== 1) return null;
  return { market: m.market, group: m.group, specifier: m.spec ? specs[m.spec]! : null, label: (o: string) => m.outcomes[o] ?? o };
}

const STATUS: Record<string, string> = { "0": "not_started", "1": "live", "2": "suspended", "3": "ended", "4": "closed", "5": "cancelled", "6": "delayed", "7": "interrupted", "8": "postponed", "9": "abandoned" };
export const eventStatus = (s: unknown) => STATUS[String(s)] ?? String(s ?? "not_started");

// ---- fixtures / schedule ----
type Ev = Record<string, any>;
export async function upsertEvents(sb: SupabaseClient, events: Ev[]) {
  const sports = new Map<string, any>(), cats = new Map<string, any>(), tours = new Map<string, any>(), matches: any[] = [];
  for (const e of events) {
    if (!String(e.id ?? "").startsWith("sr:match:")) continue;
    const t = e.tournament, s = t?.sport?.[0] ?? t?.sport, c = t?.category?.[0] ?? t?.category;
    const comps: Ev[] = e.competitors?.competitor ?? [];
    const home = comps.find((x) => x.qualifier === "home"), away = comps.find((x) => x.qualifier === "away");
    if (!t?.id || !s?.id || !c?.id || !home || !away) continue;
    sports.set(s.id, { id: s.id, name: s.name });
    cats.set(c.id, { id: c.id, sport_id: s.id, name: c.name, country_code: c.country_code ?? null });
    tours.set(t.id, { id: t.id, category_id: c.id, sport_id: s.id, name: t.name });
    matches.push({
      id: e.id, tournament_id: t.id, sport_id: s.id, category_id: c.id,
      home_team: home.name, away_team: away.name, home_id: home.id, away_id: away.id,
      scheduled: e.scheduled ?? e.start_time, status: e.status ?? "not_started", liveodds: e.liveodds ?? "not_available",
      updated_at: new Date().toISOString(),
    });
  }
  const chunk = async (table: string, rows: any[], ignore = false) => {
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await sb.from(table).upsert(rows.slice(i, i + 500), { onConflict: "id", ignoreDuplicates: ignore });
      if (error) throw new Error(`${table}: ${error.message}`);
    }
  };
  await chunk("sports", [...sports.values()].map((x) => ({ ...x })), true);
  await chunk("categories", [...cats.values()]);
  await chunk("tournaments", [...tours.values()]);
  await chunk("matches", matches);
  return { sports: sports.size, categories: cats.size, tournaments: tours.size, matches: matches.length };
}

export async function fetchFixture(sb: SupabaseClient, id: string) {
  const x = await uofGet(`/sports/en/sport_events/${encodeURIComponent(id)}/fixture.xml`);
  const f = x?.fixtures_fixture?.fixture;
  if (f) await upsertEvents(sb, [f]);
}
