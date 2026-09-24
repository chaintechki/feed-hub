import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useCallback } from "react";

import { supabase } from "@/integrations/supabase/client";
import { knownOutcomeTemplate, marketDisplayName, resolveTemplate, specString, uofIdOf } from "../../../supabase/functions/_shared/market-names.ts";

export { MARKET_GROUPS, type MarketGroup } from "../../../supabase/functions/_shared/market-names.ts";

type O = { id: string; name: string };
type Entry = { name: string; name_de: string | null; outcomes: O[]; outcomes_de: O[] | null };

/** Market catalog (base variants) with readable names; cached for the session. */
export function useMarketCatalog() {
  const { i18n } = useTranslation();
  const de = i18n.language.startsWith("de");
  const q = useQuery({
    queryKey: ["uof-markets"],
    staleTime: 60 * 60_000,
    queryFn: async () => {
      const map = new Map<number, Entry>();
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from("uof_markets").select("id,name,name_de,outcomes,outcomes_de").eq("variant", "").range(from, from + 999);
        if (error) throw error;
        for (const r of data ?? []) map.set(r.id, { name: r.name, name_de: r.name_de, outcomes: (r.outcomes as O[]) ?? [], outcomes_de: (r.outcomes_de as O[] | null) ?? null });
        if (!data || data.length < 1000) break;
      }
      return map;
    },
  });

  const marketName = useCallback(
    (market: string, specifier: string | null, home: string, away: string) => {
      const id = uofIdOf(market);
      const e = id ? q.data?.get(id) : undefined;
      if (!e) return null;
      return marketDisplayName((de && e.name_de) || e.name, specString(market, specifier), home, away);
    },
    [q.data, de],
  );
  const outcomeName = useCallback(
    (market: string, specifier: string | null, label: string, home: string, away: string) => {
      const id = uofIdOf(market);
      const e = id ? q.data?.get(id) : undefined;
      const tpl = knownOutcomeTemplate(market, label, de) ?? ((de && e?.outcomes_de) || e?.outcomes)?.find((o) => o.id === label)?.name;
      return tpl ? resolveTemplate(tpl, specString(market, specifier), home, away) : label;
    },
    [q.data, de],
  );
  return { marketName, outcomeName };
}
