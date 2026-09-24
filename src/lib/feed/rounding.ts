export type RoundingMode = "betradar" | "low_key" | "none";

type Band = [upTo: number, step: number];
/** CTRL documentation, Feed Options Live → Odds rounding. */
const BANDS: Record<Exclude<RoundingMode, "none">, Band[]> = {
  betradar: [
    [1.1, 0.01],
    [1.145, 0.02],
    [1.155, 0], // fixed 1.15
    [1.235, 0.02],
    [5, 0.05],
    [20, 0.25],
    [Infinity, 1],
  ],
  low_key: [
    [2, 0.01],
    [3, 0.02],
    [4, 0.05],
    [6, 0.1],
    [10, 0.2],
    [20, 0.5],
    [30, 1],
    [Infinity, 5],
  ],
};

export function roundOdds(odds: number, mode: RoundingMode): number {
  if (!Number.isFinite(odds) || mode === "none") return odds;
  const v = Math.max(1.01, odds);
  for (const [upTo, step] of BANDS[mode]) {
    if (v <= upTo) {
      if (step === 0) return 1.15;
      return Math.max(1.01, Math.round(Math.round(v / step) * step * 100) / 100);
    }
  }
  return v;
}

export type Harmonisation = "none" | "lowest" | "average" | "highest";
/** Force the same odds for equivalent outcomes across markets. */
export function harmonise(values: number[], mode: Harmonisation): number[] {
  if (mode === "none" || values.length < 2) return values;
  const v = mode === "lowest" ? Math.min(...values) : mode === "highest" ? Math.max(...values) : values.reduce((a, b) => a + b, 0) / values.length;
  return values.map(() => Math.round(v * 1000) / 1000);
}
