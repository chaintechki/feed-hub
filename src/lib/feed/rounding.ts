export { roundOdds, priceOdds, type RoundingMode } from "../../../supabase/functions/_shared/api-core.ts";

export type Harmonisation = "none" | "lowest" | "average" | "highest";
/** Force the same odds for equivalent outcomes across markets. */
export function harmonise(values: number[], mode: Harmonisation): number[] {
  if (mode === "none" || values.length < 2) return values;
  const v = mode === "lowest" ? Math.min(...values) : mode === "highest" ? Math.max(...values) : values.reduce((a, b) => a + b, 0) / values.length;
  return values.map(() => Math.round(v * 1000) / 1000);
}
