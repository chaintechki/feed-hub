import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { FilterBar } from "@/components/monitoring/FilterBar";
import { MatchGrid } from "@/components/monitoring/MatchGrid";
import { MonitorSubBar } from "@/components/monitoring/MonitorSubBar";
import { SportTree, type TreeSelection } from "@/components/monitoring/SportTree";
import { supabase } from "@/integrations/supabase/client";
import { useMatches, useSportTree } from "@/lib/feed/queries";
import type { LeagueTab, MatchRow, MonitorFilters } from "@/lib/feed/types";

type MatchPatch = Partial<{
  suspended: boolean;
  hotlisted: boolean;
  control_mode: string;
}>;

export default function MonitorMatches() {
  const queryClient = useQueryClient();
  const [selection, setSelection] = useState<TreeSelection>({
    sportIds: [],
    categoryIds: [],
    tournamentIds: [],
  });
  const [filters, setFilters] = useState<MonitorFilters>({});
  const [term, setTerm] = useState("");
  const [tabs, setTabs] = useState<LeagueTab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);

  const { data: tree = [] } = useSportTree();
  const effectiveSelection = useMemo(
    () => (activeTab ? { sportIds: [], categoryIds: [], tournamentIds: [activeTab] } : selection),
    [activeTab, selection],
  );
  const { data: matches = [], isLoading } = useMatches(effectiveSelection);

  const filtered = useMemo(() => {
    const q = term.trim().toLowerCase();
    const in24h = (m: MatchRow) =>
      new Date(m.scheduled).getTime() - Date.now() < 24 * 3600 * 1000;

    return matches.filter((m) => {
      if (filters.alerted && !m.alerted) return false;
      if (filters.hotlisted && !m.hotlisted) return false;
      if (filters.commented && m.commentCount === 0) return false;
      if (filters.semiAuto && m.controlMode !== "semi_auto") return false;
      if (filters.manual && m.controlMode !== "manual") return false;
      if (filters.controllable && m.controlMode === "locked") return false;
      if (filters.withOdds && m.odds.length === 0) return false;
      if (filters.withOwnOdds && !m.odds.some((o) => o.source === "own")) return false;
      if (filters.hours24 && !in24h(m)) return false;
      if (filters.providerOnly && !m.providerOnly) return false;
      if (filters.withEarlyOdds && !m.earlyOdds) return false;
      if (filters.earlyOddsAvailable && !m.earlyOdds) return false;
      if (q && !`${m.homeTeam} ${m.awayTeam} ${m.tournamentName}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [matches, filters, term]);

  useEffect(() => {
    localStorage.setItem("fp.monitorFilters", JSON.stringify(filters));
  }, [filters]);

  const patchMatch = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: MatchPatch }) => {
      const { error } = await supabase.from("matches").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["matches"] }),
    onError: (error: Error) => toast.error(error.message),
  });

  function addTabsFromSelection() {
    const names = new Map<string, string>();
    for (const sport of tree)
      for (const cat of sport.categories)
        for (const tour of cat.tournaments) names.set(tour.id, `${cat.name} ${tour.name}`);

    const added = selection.tournamentIds
      .filter((id) => !tabs.some((tab) => tab.id === id))
      .map((id) => ({ id, name: names.get(id) ?? id }));

    const last = added[added.length - 1];
    if (!last) {
      toast.info("Select one or more tournaments in the tree first.");
      return;
    }
    setTabs([...tabs, ...added]);
    setActiveTab(last.id);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MonitorSubBar
        tabs={tabs}
        activeTab={activeTab}
        onActivate={setActiveTab}
        onClose={(id) => {
          setTabs(tabs.filter((tab) => tab.id !== id));
          if (activeTab === id) setActiveTab(null);
        }}
        onAdd={addTabsFromSelection}
      />
      <div className="flex min-h-0 flex-1">
        <SportTree selection={selection} onSelectionChange={setSelection} />
        <div className="flex min-h-0 flex-1 flex-col">
          <FilterBar filters={filters} onChange={setFilters} term={term} onTermChange={setTerm} />
          <MatchGrid
            matches={filtered}
            isLoading={isLoading}
            onToggleSuspend={(m) => patchMatch.mutate({ id: m.id, patch: { suspended: !m.suspended } })}
            onToggleHotlist={(m) => patchMatch.mutate({ id: m.id, patch: { hotlisted: !m.hotlisted } })}
          />
        </div>
      </div>
    </div>
  );
}
