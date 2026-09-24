export type CostSettings = {
  currency: string;
  price_per_million_invocations: number;
  price_per_million_db_reads: number;
  price_per_gb_egress: number;
  included_invocations: number;
  included_egress_gb: number;
  fixed_monthly: number;
  upstream_monthly: number;
};

export type Volume = { allowed: number; cacheHits: number; denied: number; bytes: number };

export const emptyVolume = (): Volume => ({ allowed: 0, cacheHits: 0, denied: 0, bytes: 0 });

export function addVolume(a: Volume, b: Partial<Volume>): Volume {
  return {
    allowed: a.allowed + (b.allowed ?? 0),
    cacheHits: a.cacheHits + (b.cacheHits ?? 0),
    denied: a.denied + (b.denied ?? 0),
    bytes: a.bytes + (b.bytes ?? 0),
  };
}

export const GB = 1024 ** 3;
export const invocations = (v: Volume) => v.allowed + v.denied;
export const dbReads = (v: Volume) => Math.max(0, v.allowed - v.cacheHits) + v.denied;
export const hitRate = (v: Volume) => (v.allowed > 0 ? v.cacheHits / v.allowed : 0);

/** Usage cost with no free quota applied (used for per-day / per-client shares). */
export function variableCost(v: Volume, s: CostSettings) {
  return (
    (invocations(v) / 1e6) * s.price_per_million_invocations +
    (dbReads(v) / 1e6) * s.price_per_million_db_reads +
    (v.bytes / GB) * s.price_per_gb_egress
  );
}

/** Average daily volume from the last full days plus today's extrapolation. */
export function dailyForecast(fullDays: Volume[], today: Volume, hoursElapsed: number): Volume {
  const scale = hoursElapsed > 0.25 ? 24 / hoursElapsed : 0;
  const todayProjected: Volume = {
    allowed: today.allowed * scale,
    cacheHits: today.cacheHits * scale,
    denied: today.denied * scale,
    bytes: today.bytes * scale,
  };
  const samples = scale > 0 ? [...fullDays, todayProjected] : fullDays;
  if (!samples.length) return emptyVolume();
  const sum = samples.reduce(addVolume, emptyVolume());
  const n = samples.length;
  return { allowed: sum.allowed / n, cacheHits: sum.cacheHits / n, denied: sum.denied / n, bytes: sum.bytes / n };
}

export function monthlyForecast(daily: Volume, s: CostSettings, daysInMonth: number) {
  const inv = invocations(daily) * daysInMonth;
  const reads = dbReads(daily) * daysInMonth;
  const gb = (daily.bytes * daysInMonth) / GB;
  const invCost = (Math.max(0, inv - s.included_invocations) / 1e6) * s.price_per_million_invocations;
  const readCost = (reads / 1e6) * s.price_per_million_db_reads;
  const egressCost = Math.max(0, gb - s.included_egress_gb) * s.price_per_gb_egress;
  const usage = invCost + readCost + egressCost;
  return {
    invocations: inv,
    dbReads: reads,
    gb,
    invCost,
    readCost,
    egressCost,
    usage,
    total: usage + s.fixed_monthly + s.upstream_monthly,
  };
}

export const daysInMonth = (d = new Date()) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
