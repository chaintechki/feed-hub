/** Overround ("key") of a market in percent, e.g. 105. */
export function marketKey(odds: (number | null | undefined)[]): number | null {
  const v = odds.filter((o): o is number => typeof o === "number" && o > 1);
  if (v.length < 2 || v.length !== odds.filter((o) => o != null).length) return null;
  return Math.round(v.reduce((s, o) => s + 1 / o, 0) * 1000) / 10;
}

/** Re-price odds as if the bookmaker applied `targetKey` (normalisation, CTRL-style). */
export function normalizeTo(odds: number[], targetKey: number): number[] {
  const inv = odds.map((o) => 1 / o);
  const sum = inv.reduce((a, b) => a + b, 0);
  return inv.map((p) => Math.max(1.01, Math.round((1 / ((p / sum) * (targetKey / 100))) * 1000) / 1000));
}

export type BookQuote = { bookmakerId: string; name: string; weight: number; odds: number[] };
export type Comparison = {
  avg: number[];
  min: number[];
  max: number[];
  strength: number; // 0..1
  books: (BookQuote & { key: number | null })[];
};

/**
 * Weighted, normalised market average.
 * strength = coverage (weight share of listed books that quote) × agreement (1 − dispersion).
 */
export function compare(quotes: BookQuote[], ownKey: number, totalListWeight: number): Comparison | null {
  const valid = quotes.filter((q) => q.odds.length >= 2 && q.odds.every((o) => o > 1));
  if (!valid.length) return null;
  const n = valid[0]!.odds.length;
  const same = valid.filter((q) => q.odds.length === n);
  const norm = same.map((q) => ({ w: q.weight, o: normalizeTo(q.odds, ownKey) }));
  const wsum = norm.reduce((s, q) => s + q.w, 0);
  const avg = Array.from({ length: n }, (_, i) => Math.round((norm.reduce((s, q) => s + q.o[i]! * q.w, 0) / wsum) * 1000) / 1000);
  const min = Array.from({ length: n }, (_, i) => Math.min(...norm.map((q) => q.o[i]!)));
  const max = Array.from({ length: n }, (_, i) => Math.max(...norm.map((q) => q.o[i]!)));
  const disp = avg.reduce((s, a, i) => s + (max[i]! - min[i]!) / a, 0) / n;
  const coverage = totalListWeight > 0 ? Math.min(1, wsum / totalListWeight) : 0;
  const agreement = Math.max(0, 1 - disp * 2);
  return {
    avg,
    min,
    max,
    strength: Math.round(coverage * agreement * 100) / 100,
    books: [...same].sort((a, b) => b.weight - a.weight).map((q) => ({ ...q, key: marketKey(q.odds) })),
  };
}

export type ListRef = { level: "sport" | "category" | "tournament"; refId: string };
/** Top-down inheritance: tournament list beats category beats sport. */
export function resolveList<T extends { level: string; ref_id: string }>(
  lists: T[],
  ids: { sportId: string; categoryId: string; tournamentId: string },
): (T & { inherited: boolean; from: ListRef["level"] }) | null {
  const order: [ListRef["level"], string][] = [
    ["tournament", ids.tournamentId],
    ["category", ids.categoryId],
    ["sport", ids.sportId],
  ];
  for (const [lvl, id] of order) {
    const l = lists.find((x) => x.level === lvl && x.ref_id === id);
    if (l) return { ...l, inherited: lvl !== "tournament", from: lvl };
  }
  return null;
}
