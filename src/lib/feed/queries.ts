import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { MatchRow, OddsRow, Outcome, TreeSport } from "@/lib/feed/types";

type DbMatch = {
  id: string;
  sport_id: string;
  category_id: string;
  tournament_id: string;
  home_team: string;
  away_team: string;
  scheduled: string;
  status: string;
  liveodds: string;
  match_minute: number | null;
  booked: boolean;
  suspended: boolean;
  hotlisted: boolean;
  alerted: boolean;
  control_mode: string;
  comment_count: number;
  early_odds: boolean;
  provider_only: boolean;
};

/** Sport / category / tournament tree with per-node counters. */
export function useSportTree() {
  return useQuery({
    queryKey: ["sport-tree"],
    queryFn: async (): Promise<TreeSport[]> => {
      const [sports, categories, tournaments, matches] = await Promise.all([
        supabase.from("sports").select("id,name,sort_order").order("sort_order"),
        supabase.from("categories").select("id,name,sport_id").order("name"),
        supabase.from("tournaments").select("id,name,category_id,sport_id").order("name"),
        supabase.from("matches").select("id,sport_id,category_id,tournament_id,alerted,hotlisted"),
      ]);

      const matchList = matches.data ?? [];
      const countBy = (key: "sport_id" | "category_id" | "tournament_id", id: string) =>
        matchList.filter((m) => m[key] === id).length;
      const alertsBy = (key: "sport_id" | "category_id" | "tournament_id", id: string) =>
        matchList.filter((m) => m[key] === id && m.alerted).length;

      return (sports.data ?? []).map((sport) => {
        const cats = (categories.data ?? []).filter((c) => c.sport_id === sport.id);
        return {
          id: sport.id,
          name: sport.name,
          matchCount: countBy("sport_id", sport.id),
          alerts: alertsBy("sport_id", sport.id),
          hot: matchList.filter((m) => m.sport_id === sport.id && m.hotlisted).length,
          categories: cats.map((cat) => ({
            id: cat.id,
            name: cat.name,
            matchCount: countBy("category_id", cat.id),
            alerts: alertsBy("category_id", cat.id),
            tournaments: (tournaments.data ?? [])
              .filter((tour) => tour.category_id === cat.id)
              .map((tour) => ({
                id: tour.id,
                name: tour.name,
                matchCount: countBy("tournament_id", tour.id),
                alerts: alertsBy("tournament_id", tour.id),
              })),
          })),
        };
      });
    },
  });
}

/** Matches plus their own/average odds for the current tree selection. */
export function useMatches(selection: { sportIds: string[]; categoryIds: string[]; tournamentIds: string[] }) {
  return useQuery({
    queryKey: ["matches", selection],
    queryFn: async (): Promise<MatchRow[]> => {
      let query = supabase
        .from("matches")
        .select(
          "id,sport_id,category_id,tournament_id,home_team,away_team,scheduled,status,liveodds,match_minute,booked,suspended,hotlisted,alerted,control_mode,comment_count,early_odds,provider_only",
        )
        .order("scheduled")
        .limit(500);

      if (selection.tournamentIds.length) query = query.in("tournament_id", selection.tournamentIds);
      else if (selection.categoryIds.length) query = query.in("category_id", selection.categoryIds);
      else if (selection.sportIds.length) query = query.in("sport_id", selection.sportIds);

      const { data, error } = await query;
      if (error) throw error;
      const rows = (data ?? []) as DbMatch[];
      if (!rows.length) return [];

      const [{ data: odds }, { data: tours }, { data: cats }, { data: sports }] = await Promise.all([
        supabase
          .from("match_odds")
          .select("match_id,source,market,specifier,outcomes,margin")
          .in(
            "match_id",
            rows.map((r) => r.id),
          ),
        supabase.from("tournaments").select("id,name"),
        supabase.from("categories").select("id,name"),
        supabase.from("sports").select("id,name"),
      ]);

      const tourName = new Map((tours ?? []).map((t) => [t.id, t.name]));
      const catName = new Map((cats ?? []).map((c) => [c.id, c.name]));
      const sportName = new Map((sports ?? []).map((s) => [s.id, s.name]));

      return rows.map((m) => ({
        id: m.id,
        sportId: m.sport_id,
        categoryId: m.category_id,
        tournamentId: m.tournament_id,
        tournamentName: tourName.get(m.tournament_id) ?? "",
        categoryName: catName.get(m.category_id) ?? "",
        sportName: sportName.get(m.sport_id) ?? "",
        homeTeam: m.home_team,
        awayTeam: m.away_team,
        scheduled: m.scheduled,
        status: m.status,
        liveodds: m.liveodds,
        matchMinute: m.match_minute,
        booked: m.booked,
        suspended: m.suspended,
        hotlisted: m.hotlisted,
        alerted: m.alerted,
        controlMode: m.control_mode,
        commentCount: m.comment_count,
        earlyOdds: m.early_odds,
        providerOnly: m.provider_only,
        odds: (odds ?? [])
          .filter((o) => o.match_id === m.id)
          .map<OddsRow>((o) => ({
            source: o.source as OddsRow["source"],
            market: o.market as OddsRow["market"],
            specifier: o.specifier,
            outcomes: (o.outcomes as unknown as Outcome[]) ?? [],
            margin: o.margin == null ? null : Number(o.margin),
          })),
      }));
    },
  });
}

export function useAlerts() {
  return useQuery({
    queryKey: ["alerts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("alerts")
        .select("id,match_id,severity,type,message,acknowledged_at,created_at")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSettlements() {
  return useQuery({
    queryKey: ["settlements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("settlements")
        .select("id,match_id,market,specifier,outcome,state,settled_at,created_at")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useOutrights() {
  return useQuery({
    queryKey: ["outrights"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("outrights")
        .select("id,tournament_id,name,scheduled,status,competitors")
        .order("name")
        .limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });
}
