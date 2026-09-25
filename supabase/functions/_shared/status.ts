// Pure rules for reconciling match status with the provider (unit-tested in src/lib/statusSync.test.ts).
export const FINAL = new Set(["ended", "closed", "cancelled", "postponed", "abandoned"]);
export const OPEN = ["not_started", "live", "suspended", "delayed", "interrupted"];
const NUM: Record<string, string> = { "0": "not_started", "1": "live", "2": "suspended", "3": "ended", "4": "closed", "5": "cancelled", "6": "delayed", "7": "interrupted", "8": "postponed", "9": "abandoned" };

/** Minimum age (after scheduled start) before a match is checked with the provider. */
export const CHECK_AFTER_MS = 3 * 3600_000;
/** Age after which a still-open match is set to ended even without a final provider status. */
export const FORCE_AFTER_MS = 12 * 3600_000;

export function normStatus(s: unknown): string | null {
  if (s === undefined || s === null || s === "") return null;
  const v = String(s).toLowerCase();
  return NUM[v] ?? v;
}

/**
 * Decide the new status for one match. Returns null when nothing changes.
 * `provider` is the provider's status (null = no answer).
 */
export function decideStatus(current: string, scheduledIso: string, provider: string | null, now = Date.now()): { status: string; forced: boolean } | null {
  if (FINAL.has(current)) return null;
  const age = now - Date.parse(scheduledIso);
  if (age < CHECK_AFTER_MS) return null;
  if (provider && FINAL.has(provider)) return { status: provider, forced: false };
  if (age >= FORCE_AFTER_MS) return { status: "ended", forced: true };
  if (provider && provider !== current) return { status: provider, forced: false };
  return null;
}
