import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { groupOf, type MarketGroup } from "./market-names.ts";
import { cacheHit, cacheLoad, cacheMiss, flushCacheStats } from "./cache-stats.ts";
export * from "./market-names.ts";

type Outcome = { id: string; name: string };
export type CatalogEntry = { id: number; name: string; name_de: string | null; group: MarketGroup; specifiers: string | null; outcomes: Outcome[]; outcomes_de: Outcome[] | null };

let cache: { at: number; map: Map<number, CatalogEntry> } | null = null;

/** Base-variant market catalog, cached 10 min per instance. */
export async function catalog(sb: SupabaseClient): Promise<Map<number, CatalogEntry>> {
  if (cache && Date.now() - cache.at < 600_000) {
    cacheHit();
    flushCacheStats(sb);
    return cache.map;
  }
  cacheMiss();
  const t0 = performance.now();
  let reads = 0;
  const map = new Map<number, CatalogEntry>();
  for (let from = 0; ; from += 1000) {
    reads++;
    const { data, error } = await sb.from("uof_markets").select("id,variant,name,name_de,outcomes,outcomes_de,specifiers,market_group").eq("variant", "").range(from, from + 999);
    if (error) throw error;
    for (const r of data ?? []) map.set(r.id, { id: r.id, name: r.name, name_de: r.name_de, group: (r.market_group as MarketGroup) ?? groupOf(r.name), specifiers: r.specifiers, outcomes: (r.outcomes as Outcome[]) ?? [], outcomes_de: (r.outcomes_de as Outcome[] | null) ?? null });
    if (!data || data.length < 1000) break;
  }
  cache = { at: Date.now(), map };
  cacheLoad(performance.now() - t0, reads, map.size);
  flushCacheStats(sb);
  return map;
}

