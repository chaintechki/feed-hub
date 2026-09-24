// Pure helpers shared by edge functions and the panel (no runtime imports).
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

/** Outcome name templates for the panel's own keys (known markets store translated labels). */
const KNOWN_OUT: Record<string, [string, string]> = {
  "1": ["{$competitor1}", "{$competitor1}"], X: ["draw", "Unentschieden"], "2": ["{$competitor2}", "{$competitor2}"],
  Over: ["over {total}", "über {total}"], Under: ["under {total}", "unter {total}"],
  Yes: ["yes", "ja"], No: ["no", "nein"],
  "1X": ["{$competitor1} or draw", "{$competitor1} oder Unentschieden"], "12": ["{$competitor1} or {$competitor2}", "{$competitor1} oder {$competitor2}"], X2: ["draw or {$competitor2}", "Unentschieden oder {$competitor2}"],
};
export function knownOutcomeTemplate(market: string, label: string, de: boolean): string | undefined {
  if (market.startsWith("m")) return undefined;
  if (market === "handicap") return label === "1" ? "{$competitor1} ({+hcp})" : label === "2" ? "{$competitor2} ({-hcp})" : undefined;
  const t = KNOWN_OUT[label];
  return t ? t[de ? 1 : 0] : undefined;
}

/** Market key used in feed responses for a UOF id. */
export const marketKeyOf = (id: number) => Object.entries(KNOWN).find(([, v]) => v === id)?.[0] ?? `m${id}`;

/** Market display name; appends specifier values the template does not show (e.g. "Handicap (incl. overtime) -1.5"). */
export function marketDisplayName(tpl: string, specifier: string | null, home: string, away: string) {
  const name = resolveTemplate(tpl, specifier, home, away);
  const extra = (specifier ?? "").split("|").filter(Boolean).map((s) => s.split("=")).filter(([k]) => k && !tpl.includes(k)).map(([, v]) => v);
  return extra.length ? `${name} ${extra.join(" ")}` : name;
}
