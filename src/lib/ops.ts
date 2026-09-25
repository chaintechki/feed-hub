export type CacheRow = { source: string; minute: string; hits: number; misses: number; db_reads: number; load_ms: number; loads: number; entries: number; refreshed_at: string | null };

export type CacheSummary = { source: string; hits: number; misses: number; hitPct: number | null; dbReads: number; avgLoadMs: number | null; entries: number; refreshedAt: string | null };

/** Aggregate per-minute cache counters by source. */
export function summarizeCache(rows: CacheRow[]): CacheSummary[] {
  const m = new Map<string, CacheSummary & { loadMs: number; loads: number }>();
  for (const r of rows) {
    const s = m.get(r.source) ?? { source: r.source, hits: 0, misses: 0, hitPct: null, dbReads: 0, avgLoadMs: null, entries: 0, refreshedAt: null, loadMs: 0, loads: 0 };
    s.hits += r.hits;
    s.misses += r.misses;
    s.dbReads += r.db_reads;
    s.loadMs += r.load_ms;
    s.loads += r.loads;
    s.entries = Math.max(s.entries, r.entries);
    if (r.refreshed_at && (!s.refreshedAt || r.refreshed_at > s.refreshedAt)) s.refreshedAt = r.refreshed_at;
    m.set(r.source, s);
  }
  return [...m.values()]
    .map(({ loadMs, loads, ...s }) => ({
      ...s,
      hitPct: s.hits + s.misses ? Math.round((1000 * s.hits) / (s.hits + s.misses)) / 10 : null,
      avgLoadMs: loads ? Math.round(loadMs / loads) : null,
    }))
    .sort((a, b) => a.source.localeCompare(b.source));
}

/** Hourly buckets of hit rate and db reads over all sources. */
export function cacheSeries(rows: CacheRow[]) {
  const m = new Map<string, { t: string; hits: number; misses: number; dbReads: number }>();
  for (const r of rows) {
    const t = r.minute.slice(0, 13);
    const b = m.get(t) ?? { t, hits: 0, misses: 0, dbReads: 0 };
    b.hits += r.hits;
    b.misses += r.misses;
    b.dbReads += r.db_reads;
    m.set(t, b);
  }
  return [...m.values()]
    .sort((a, b) => a.t.localeCompare(b.t))
    .map((b) => ({ t: b.t, hitPct: b.hits + b.misses ? Math.round((1000 * b.hits) / (b.hits + b.misses)) / 10 : null, dbReads: b.dbReads }));
}

export function fmtBytes(n: number | null | undefined) {
  if (n == null) return "—";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i >= 2 ? 1 : 0)} ${u[i]}`;
}
