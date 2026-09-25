import { describe, expect, it } from "vitest";

import { emptyCounters, hasData } from "../../supabase/functions/_shared/cache-stats.ts";
import { cacheSeries, fmtBytes, summarizeCache, type CacheRow } from "./ops";

const row = (p: Partial<CacheRow>): CacheRow => ({ source: "feed-api", minute: "2026-09-25T10:00:00Z", hits: 0, misses: 0, db_reads: 0, load_ms: 0, loads: 0, entries: 0, refreshed_at: null, ...p });

describe("cache metrics", () => {
  it("summarizes hit rate, reads and load time per source", () => {
    const s = summarizeCache([
      row({ hits: 9, misses: 1, db_reads: 3, load_ms: 300, loads: 1, entries: 1200, refreshed_at: "2026-09-25T10:00:10Z" }),
      row({ minute: "2026-09-25T10:01:00Z", hits: 10, misses: 0, refreshed_at: null }),
      row({ source: "uof-ingest", hits: 0, misses: 2, db_reads: 2, load_ms: 50, loads: 2 }),
    ]);
    expect(s[0]).toMatchObject({ source: "feed-api", hitPct: 95, dbReads: 3, avgLoadMs: 300, entries: 1200, refreshedAt: "2026-09-25T10:00:10Z" });
    expect(s[1]).toMatchObject({ source: "uof-ingest", hitPct: 0, avgLoadMs: 25 });
  });
  it("returns null rates without traffic", () => {
    expect(summarizeCache([row({})])[0].hitPct).toBeNull();
    expect(hasData(emptyCounters())).toBe(false);
  });
  it("buckets hourly", () => {
    const s = cacheSeries([row({ hits: 1 }), row({ minute: "2026-09-25T10:30:00Z", misses: 1, db_reads: 4 }), row({ minute: "2026-09-25T11:00:00Z", hits: 2 })]);
    expect(s).toEqual([{ t: "2026-09-25T10", hitPct: 50, dbReads: 4 }, { t: "2026-09-25T11", hitPct: 100, dbReads: 0 }]);
  });
  it("formats bytes", () => {
    expect(fmtBytes(570 * 1024 * 1024)).toBe("570.0 MB");
  });
});
