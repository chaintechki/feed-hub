// In-memory cache counters, flushed at most every few seconds to public.cache_stats (see cache_track).
// Flush errors are swallowed so metrics can never block the feed.

export type Counters = { hits: number; misses: number; db_reads: number; load_ms: number; loads: number; entries: number; refreshed_at: string | null };

export const emptyCounters = (): Counters => ({ hits: 0, misses: 0, db_reads: 0, load_ms: 0, loads: 0, entries: 0, refreshed_at: null });

let source = "unknown";
let c = emptyCounters();
let lastFlush = 0;
// Instances live only seconds, so flush at most every 5 s (first event flushes at once).
const GAP_MS = 5_000;

export function setCacheSource(name: string) {
  source = name;
}
export function cacheHit() {
  c.hits++;
}
export function cacheMiss() {
  c.misses++;
}
export function cacheLoad(ms: number, reads: number, entries: number) {
  c.loads++;
  c.load_ms += Math.max(0, Math.round(ms));
  c.db_reads += reads;
  c.entries = Math.max(c.entries, entries);
  c.refreshed_at = new Date().toISOString();
}
export function snapshot(): Counters {
  return { ...c };
}
export function hasData(x: Counters) {
  return x.hits + x.misses + x.db_reads + x.loads > 0;
}

/** Pass the service client; writes only when GAP_MS has passed since the last flush (or force). */
// deno-lint-ignore no-explicit-any
export async function flushCacheStats(sb: any, force = false, now = Date.now()) {
  if (!force && now - lastFlush < GAP_MS) return false;
  const x = c;
  if (!hasData(x)) {
    lastFlush = now;
    return false;
  }
  c = emptyCounters();
  lastFlush = now;
  try {
    await sb.rpc("cache_track", {
      _source: source, _hits: x.hits, _misses: x.misses, _db_reads: x.db_reads,
      _load_ms: x.load_ms, _loads: x.loads, _entries: x.entries, _refreshed_at: x.refreshed_at,
    });
  } catch {
    /* ignore */
  }
  return true;
}
