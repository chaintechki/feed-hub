import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { ActiveFilterChips } from "@/components/monitoring/ActiveFilterChips";
import { FilterBar } from "@/components/monitoring/FilterBar";
import { MatchGrid } from "@/components/monitoring/MatchGrid";
import { LoadProgressBar } from "@/components/monitoring/LoadProgressBar";
import { OutrightsPanel } from "@/components/monitoring/OutrightsPanel";
import { MonitorSubBar } from "@/components/monitoring/MonitorSubBar";
import { SportTree, type TreeSelection } from "@/components/monitoring/SportTree";
import { supabase } from "@/integrations/supabase/client";
import { useMatches, useSportTree } from "@/lib/feed/queries";
import { activeFilterChips, matchesMonitorFilters, matchesTreeScope, readMonitorFilters, type ActiveChip } from "@/lib/feed/filters";
import type { LeagueTab, MatchRow, MonitorFilters } from "@/lib/feed/types";
import { friendlyError } from "@/lib/errors";

type MatchPatch = Partial<{
  suspended: boolean;
  hotlisted: boolean;
  control_mode: string;
}>;

const ALL = { sportIds: [], categoryIds: [], tournamentIds: [] };

export default function MonitorMatches() {
  const queryClient = useQueryClient();
  const [selection, setSelection] = useState<TreeSelection>({
    sportIds: [],
    categoryIds: [],
    tournamentIds: [],
  });
  const [filters, setFilters] = useState<MonitorFilters>(() =>
    readMonitorFilters(typeof window === "undefined" ? undefined : window.localStorage),
  );
  const [term, setTerm] = useState("");
  const [tabs, setTabs] = useState<LeagueTab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);

  const { data: tree = [] } = useSportTree();
  const effectiveSelection = useMemo(
    () => (activeTab ? { sportIds: [], categoryIds: [], tournamentIds: [activeTab] } : selection),
    [activeTab, selection],
  );
  // Load the full set once; tree scope, flags and search are applied locally.
  const { data: matches = [], isLoading, isError } = useMatches(ALL);
  const deferredTerm = useDeferredValue(term);
  const deferredScope = useDeferredValue(effectiveSelection);

  const filtered = useMemo(() => {
    const now = Date.now();
    return matches.filter(
      (match) => matchesTreeScope(match, deferredScope) && matchesMonitorFilters(match, filters, deferredTerm, now),
    );
  }, [matches, filters, deferredTerm, deferredScope]);

  const chips = useMemo(() => {
    const names = new Map<string, string>();
    for (const sport of tree) {
      names.set(sport.id, sport.name);
      for (const cat of sport.categories) {
        names.set(cat.id, cat.name);
        for (const tour of cat.tournaments) names.set(tour.id, tour.name);
      }
    }
    const tab = tabs.find((x) => x.id === activeTab) ?? null;
    return activeFilterChips(filters, term, selection, names, tab);
  }, [tree, tabs, activeTab, filters, term, selection]);

  function removeChip(c: ActiveChip) {
    if (c.kind === "flag") setFilters({ ...filters, [c.key]: false });
    else if (c.kind === "term") setTerm("");
    else if (c.kind === "tab") setActiveTab(null);
    else {
      const k = c.kind === "sport" ? "sportIds" : c.kind === "category" ? "categoryIds" : "tournamentIds";
      setSelection({ ...selection, [k]: selection[k].filter((id) => id !== c.id) });
    }
  }

  function clearAll() {
    setFilters({});
    setTerm("");
    setActiveTab(null);
    setSelection({ sportIds: [], categoryIds: [], tournamentIds: [] });
  }

  useEffect(() => {
    localStorage.setItem("fp.monitorFilters", JSON.stringify(filters));
  }, [filters]);

  const patchMatch = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: MatchPatch }) => {
      const { error } = await supabase.from("matches").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["matches"] }),
    onError: (error: Error) => toast.error(friendlyError(error)),
  });

  const { mutate } = patchMatch;
  const toggleSuspend = useCallback((m: MatchRow) => mutate({ id: m.id, patch: { suspended: !m.suspended } }), [mutate]);
  const toggleHotlist = useCallback((m: MatchRow) => mutate({ id: m.id, patch: { hotlisted: !m.hotlisted } }), [mutate]);

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
          <ActiveFilterChips chips={chips} onRemove={removeChip} onClearAll={clearAll} />
          <LoadProgressBar count={filtered.length} total={matches.length} />
          <MatchGrid
            matches={filtered}
            isLoading={isLoading}
            isError={isError}
            onToggleSuspend={toggleSuspend}
            onToggleHotlist={toggleHotlist}
          />
        </div>
        <OutrightsPanel tournamentIds={selection.tournamentIds} />
      </div>
    </div>
  );
}
