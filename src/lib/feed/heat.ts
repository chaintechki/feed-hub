/** Fade window for odds change colouring (CTRL: colour fades over time). */
export const HEAT_WINDOW_MS = 10 * 60 * 1000;

export type Heat = { dir: "heat" | "cool"; at: string };

/** 1 = just changed, 0 = older than window. Linear fade. */
export function heatIntensity(at: string | null | undefined, now = Date.now()): number {
  if (!at) return 0;
  const age = now - new Date(at).getTime();
  if (!Number.isFinite(age) || age < 0) return age < 0 ? 1 : 0;
  if (age >= HEAT_WINDOW_MS) return 0;
  return Math.round((1 - age / HEAT_WINDOW_MS) * 100) / 100;
}

/** Rising odds = heating up (pink), falling odds = cooling off (blue). */
export function heatDir(prev: number | null | undefined, next: number): Heat["dir"] | null {
  if (prev == null || prev === next) return null;
  return next > prev ? "heat" : "cool";
}

/** Inline background built from semantic tokens only. */
export function heatStyle(heat: Heat | undefined, suspended: boolean, now = Date.now()) {
  if (suspended) return { backgroundColor: "hsl(var(--odds-suspended))" };
  const k = heatIntensity(heat?.at, now);
  if (!heat || k <= 0) return undefined;
  const token = heat.dir === "heat" ? "--odds-heat" : "--odds-cool";
  return { backgroundColor: `hsl(var(${token}) / ${(0.2 + 0.8 * k).toFixed(2)})` };
}

export const heatKey = (matchId: string, market: string, spec: string | null, label: string) =>
  `${matchId}|${market}|${spec ?? ""}|${label}`;
