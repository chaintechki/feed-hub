import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { compare, marketKey, resolveList, type BookQuote, type Comparison } from "@/lib/feed/normalize";
import type { MatchRow, OddsRow } from "@/lib/feed/types";

export type Bookmaker = { id: string; name: string; suggested: boolean };
export type BmList = { id: string; level: "sport" | "category" | "tournament"; ref_id: string; items: { bookmaker_id: string; weight: number }[] };
export type BmOdds = { match_id: string; bookmaker_id: string; market: string; specifier: string | null; outcomes: { label: string; odds: number | null }[] };

export function useBookmakers() {
  return useQuery({
    queryKey: ["bookmakers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("bookmakers").select("id,name,suggested").order("name");
      if (error) throw error;
      return (data ?? []) as Bookmaker[];
    },
  });
}

export function useBookmakerLists() {
  return useQuery({
    queryKey: ["bookmaker_lists"],
    queryFn: async () => {
      const [l, i] = await Promise.all([
        supabase.from("bookmaker_lists").select("id,level,ref_id"),
        supabase.from("bookmaker_list_items").select("list_id,bookmaker_id,weight"),
      ]);
      if (l.error) throw l.error;
      if (i.error) throw i.error;
      return (l.data ?? []).map((x) => ({
        ...x,
        items: (i.data ?? []).filter((y) => y.list_id === x.id).map((y) => ({ bookmaker_id: y.bookmaker_id, weight: Number(y.weight) })),
      })) as BmList[];
    },
  });
}

export async function fetchBookmakerOdds(matchIds: string[]) {
  if (!matchIds.length) return [] as BmOdds[];
  const { data, error } = await supabase.from("bookmaker_odds").select("match_id,bookmaker_id,market,specifier,outcomes").in("match_id", matchIds);
  if (error) throw error;
  return (data ?? []) as unknown as BmOdds[];
}

/** Build a comparison for one own market row against the effective bookmaker list. */
export function compareMarket(
  own: OddsRow,
  matchId: string,
  ids: { sportId: string; categoryId: string; tournamentId: string },
  lists: BmList[],
  books: Bookmaker[],
  odds: BmOdds[],
): Comparison | null {
  const list = resolveList(lists, ids);
  if (!list) return null;
  const priced = (arr: { odds: number | null }[]) => arr.filter((o) => o.odds != null).map((o) => Number(o.odds));
  const ownKey = marketKey(priced(own.outcomes));
  if (!ownKey) return null;
  const quotes: BookQuote[] = list.items.flatMap((it) => {
    const q = odds.find((o) => o.match_id === matchId && o.bookmaker_id === it.bookmaker_id && o.market === own.market && (o.specifier ?? null) === (own.specifier ?? null));
    if (!q) return [];
    return [{ bookmakerId: it.bookmaker_id, name: books.find((b) => b.id === it.bookmaker_id)?.name ?? it.bookmaker_id, weight: it.weight, odds: priced(q.outcomes) }];
  });
  return compare(quotes, ownKey, list.items.reduce((s, i) => s + i.weight, 0));
}

/** Comparison per match+own market row for a set of matches (key: id|market|spec). */
export function useComparisons(matches: MatchRow[]) {
  const ids = matches.map((m) => m.id);
  const lists = useBookmakerLists();
  const books = useBookmakers();
  const odds = useQuery({ queryKey: ["bm-odds", ids], enabled: ids.length > 0, queryFn: () => fetchBookmakerOdds(ids) });
  const out = new Map<string, Comparison>();
  if (!lists.data || !books.data || !odds.data) return out;
  for (const m of matches)
    for (const own of m.odds.filter((o) => o.source === "own")) {
      const c = compareMarket(own, m.id, m, lists.data, books.data, odds.data);
      if (c) out.set(`${m.id}|${own.market}|${own.specifier ?? ""}`, c);
    }
  return out;
}
