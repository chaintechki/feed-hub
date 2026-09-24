import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export const MARKET_GROUPS = ["main", "goals", "half", "periods", "corners", "cards", "players", "other"] as const;
export type MarketGroup = (typeof MARKET_GROUPS)[number];

/** Keyword-based group for a catalog market name (mirrors SQL market_group_of). */
export function groupOf(name: string): MarketGroup {
  const n = name.toLowerCase();
  if (/(\{%player\}|player|scorer)/.test(n)) return "players";
  if (/corner/.test(n)) return "corners";
  if (/(card|booking)/.test(n)) return "cards";
  if (/half/.test(n)) return "half";
  if (/(quarter|period|set|inning|map|game|round|frame|over |overs)/.test(n)) return "periods";
  if (/(goal|score|both teams|exact|odd\/even)/.test(n)) return "goals";
  if (/(total|handicap|winner|1x2|draw no bet|double chance|moneyline)/.test(n)) return "main";
  return "other";
}

type Outcome = { id: string; name: string };
export type CatalogEntry = { id: number; name: string; name_de: string | null; group: MarketGroup; specifiers: string | null; outcomes: Outcome[]; outcomes_de: Outcome[] | null };

let cache: { at: number; map: Map<number, CatalogEntry> } | null = null;

/** Base-variant market catalog, cached 10 min per instance. */
export async function catalog(sb: SupabaseClient): Promise<Map<number, CatalogEntry>> {
  if (cache && Date.now() - cache.at < 600_000) return cache.map;
  const map = new Map<number, CatalogEntry>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("uof_markets").select("id,variant,name,name_de,outcomes,outcomes_de,specifiers,market_group").eq("variant", "").range(from, from + 999);
    if (error) throw error;
    for (const r of data ?? []) map.set(r.id, { id: r.id, name: r.name, name_de: r.name_de, group: (r.market_group as MarketGroup) ?? groupOf(r.name), specifiers: r.specifiers, outcomes: (r.outcomes as Outcome[]) ?? [], outcomes_de: (r.outcomes_de as Outcome[] | null) ?? null });
    if (!data || data.length < 1000) break;
  }
  cache = { at: Date.now(), map };
  return map;
}

const ORD = (n: number) => `${n}${["th", "st", "nd", "rd"][(n % 100 > 10 && n % 100 < 14) || n % 10 > 3 ? 0 : n % 10]}`;

/** Resolve a UOF name template: {total}, {+hcp}, {-hcp}, {!quarternr}, {$competitor1}. */
export function resolveTemplate(tpl: string, specifier: string | null, home: string, away: string) {
  const specs = Object.fromEntries((specifier ?? "").split("|").filter(Boolean).map((s) => s.split("=") as [string, string]));
  return tpl.replace(/\{([+\-!$%]?)([a-z0-9_]+)\}/gi, (all, op: string, key: string) => {
    if (op === "$") return key === "competitor1" ? home : key === "competitor2" ? away : all;
    const v = specs[key];
    if (v === undefined) return op === "%" ? key : all;
    if (op === "!") return Number.isFinite(Number(v)) ? ORD(Number(v)) : v;
    if (op === "+") { const n = Number(v); return n > 0 ? `+${n}` : String(n); }
    if (op === "-") { const n = -Number(v); return n > 0 ? `+${n}` : String(n); }
    return v;
  });
}

/** Parse market key: "m123" → 123, known keys → their UOF id. */
const KNOWN: Record<string, number> = { "1x2": 1, total: 18, handicap: 16, double_chance: 10, btts: 29, ht_1x2: 60, ht_total: 68 };
export const uofIdOf = (market: string) => (market.startsWith("m") ? Number(market.slice(1)) || null : KNOWN[market] ?? null);

/** Raw specifier string for templates (known markets store only the value). */
export function specString(market: string, specifier: string | null) {
  if (!specifier || specifier.includes("=")) return specifier;
  if (market.endsWith("total")) return `total=${specifier}`;
  if (market === "handicap") return `hcp=${specifier}`;
  return specifier;
}
