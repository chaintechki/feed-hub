import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { HEAT_WINDOW_MS, heatDir, heatKey, type Heat } from "@/lib/feed/heat";
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
  margin_skewed: boolean;
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
          "id,sport_id,category_id,tournament_id,home_team,away_team,scheduled,status,liveodds,match_minute,booked,suspended,hotlisted,alerted,control_mode,comment_count,early_odds,provider_only,margin_skewed",
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

      const ids = rows.map((r) => r.id);
      const since = new Date(Date.now() - HEAT_WINDOW_MS).toISOString();
      const [{ data: odds }, { data: tours }, { data: cats }, { data: sports }, { data: hist }, { data: alerts }, { data: logs }] = await Promise.all([
        supabase
          .from("match_odds")
          .select("match_id,source,market,specifier,outcomes,margin,suspended,control_mode,market_group,alerted,updated_at")
          .in("match_id", ids),
        supabase.from("tournaments").select("id,name"),
        supabase.from("categories").select("id,name"),
        supabase.from("sports").select("id,name"),
        supabase.from("odds_history").select("match_id,market,specifier,outcome,odds,prev_odds,changed_at").in("match_id", ids).gte("changed_at", since).order("changed_at"),
        supabase.from("alerts").select("match_id,score").in("match_id", ids).is("acknowledged_at", null),
        supabase.from("alert_log").select("match_id").in("match_id", ids),
      ]);
      const heat = buildHeat(hist ?? []);
      const score = new Map<string, number>();
      for (const a of alerts ?? []) if (a.match_id) score.set(a.match_id, (score.get(a.match_id) ?? 0) + Number(a.score));
      const logCount = new Map<string, number>();
      for (const l of logs ?? []) logCount.set(l.match_id, (logCount.get(l.match_id) ?? 0) + 1);

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
        marginSkewed: m.margin_skewed,
        alertScore: Math.round(score.get(m.id) ?? 0),
        logCount: logCount.get(m.id) ?? 0,
        heat: heat[m.id] ?? {},
        odds: (odds ?? []).filter((o) => o.match_id === m.id).map(toOddsRow),
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

type DbOdds = {
  source: string;
  market: string;
  specifier: string | null;
  outcomes: unknown;
  margin: number | null;
  suspended: boolean;
  control_mode: string;
  market_group: string;
  alerted: boolean;
  updated_at: string;
};
export const toOddsRow = (o: DbOdds): OddsRow => ({
  source: o.source as OddsRow["source"],
  market: o.market as OddsRow["market"],
  specifier: o.specifier,
  outcomes: (o.outcomes as Outcome[]) ?? [],
  margin: o.margin == null ? null : Number(o.margin),
  suspended: o.suspended,
  controlMode: o.control_mode,
  group: o.market_group,
  alerted: o.alerted,
  updatedAt: o.updated_at,
});

type DbHist = { match_id: string; market: string; specifier: string | null; outcome: string; odds: number; prev_odds: number | null; changed_at: string };
/** Latest change per outcome, grouped by match. */
export function buildHeat(hist: DbHist[]) {
  const out: Record<string, Record<string, Heat>> = {};
  for (const h of hist) {
    const dir = heatDir(h.prev_odds == null ? null : Number(h.prev_odds), Number(h.odds));
    if (!dir) continue;
    (out[h.match_id] ??= {})[heatKey(h.match_id, h.market, h.specifier, h.outcome)] = { dir, at: h.changed_at };
  }
  return out;
}

/** Single match with all markets (Match Up view). */
export function useMatchUp(id: string | undefined) {
  return useQuery({
    queryKey: ["matchup", id],
    enabled: !!id,
    refetchInterval: 15_000,
    queryFn: async () => {
      const since = new Date(Date.now() - HEAT_WINDOW_MS).toISOString();
      const [m, o, h] = await Promise.all([
        supabase.from("matches").select("*, tournaments(name), categories(name), sports(name)").eq("id", id!).maybeSingle(),
        supabase.from("match_odds").select("match_id,source,market,specifier,outcomes,margin,suspended,control_mode,market_group,alerted,updated_at").eq("match_id", id!).order("market"),
        supabase.from("odds_history").select("match_id,market,specifier,outcome,odds,prev_odds,changed_at").eq("match_id", id!).gte("changed_at", since).order("changed_at"),
      ]);
      if (m.error) throw m.error;
      if (o.error) throw o.error;
      return { match: m.data, odds: (o.data ?? []).map(toOddsRow), heat: buildHeat(h.data ?? [])[id!] ?? {} };
    },
  });
}

export function useMatchAlerts(id: string | null) {
  return useQuery({
    queryKey: ["match-alerts", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("alerts")
        .select("id,type,severity,message,score,factors,acknowledged_at,created_at")
        .eq("match_id", id!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMatchComments(id: string | null) {
  return useQuery({
    queryKey: ["match-comments", id],
    enabled: !!id,
    queryFn: async () => {
      const [c, l] = await Promise.all([
        supabase.from("match_comments").select("id,body,author_id,created_at").eq("match_id", id!).order("created_at", { ascending: false }),
        supabase.from("alert_log").select("id,action,user_id,details,created_at").eq("match_id", id!).order("created_at", { ascending: false }),
      ]);
      if (c.error) throw c.error;
      if (l.error) throw l.error;
      return { comments: c.data ?? [], log: l.data ?? [] };
    },
  });
}
