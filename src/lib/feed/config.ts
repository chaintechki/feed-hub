import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export const MARKETS = [
  { id: "1x2", outcomes: ["1", "X", "2"], lines: false },
  { id: "total", outcomes: ["Over", "Under"], lines: true },
  { id: "handicap", outcomes: ["1", "2"], lines: true },
  { id: "double_chance", outcomes: ["1X", "12", "X2"], lines: false },
  { id: "btts", outcomes: ["Yes", "No"], lines: false },
  { id: "ht_1x2", outcomes: ["1", "X", "2"], lines: false },
  { id: "ht_total", outcomes: ["Over", "Under"], lines: true },
  { id: "correct_score", outcomes: [], lines: false },
] as const;
export const LINE_TYPES = ["0.25", "0.5", "1"] as const;

export type TimelinePoint = { at: "inst" | number; key: number };
export type MarketConf = {
  enabled: boolean;
  timeline: TimelinePoint[];
  distribution: number[];
  lines: { types: string[]; max: number } | null;
  ladder_id: string | null;
};
export type TemplateConfig = { markets: Record<string, MarketConf> };
export type Template = { id: string; name: string; sport_id: string | null; ladder_id: string | null; config: TemplateConfig; updated_at: string };
export type Ladder = { id: string; name: string; kind: "single" | "pairs"; values: unknown[]; is_system: boolean };

export function defaultMarket(id: string): MarketConf {
  const m = MARKETS.find((x) => x.id === id);
  return {
    enabled: true,
    timeline: [{ at: "inst", key: 106 }],
    distribution: (m?.outcomes ?? []).map(() => 0),
    lines: m?.lines ? { types: ["0.5"], max: 2 } : null,
    ladder_id: null,
  };
}

/** Sort timeline: "inst" first, then furthest-out hours first. */
export const sortTimeline = (t: TimelinePoint[]) =>
  [...t].sort((a, b) => (a.at === "inst" ? -1 : b.at === "inst" ? 1 : b.at - a.at));

/** Key in effect `hoursBefore` kickoff for a timeline (null = market not yet published). */
export function keyAt(t: TimelinePoint[], hoursBefore: number): number | null {
  let k: number | null = null;
  for (const p of sortTimeline(t)) if (p.at === "inst" || hoursBefore <= p.at) k = p.key;
  return k;
}

export function useLadders() {
  return useQuery({
    queryKey: ["ladders"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ladders").select("id,name,kind,values,is_system").order("is_system", { ascending: false }).order("name");
      if (error) throw error;
      return (data ?? []) as unknown as Ladder[];
    },
  });
}

export function useTemplates() {
  return useQuery({
    queryKey: ["templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("templates").select("id,name,sport_id,ladder_id,config,updated_at").order("name");
      if (error) throw error;
      return (data ?? []) as unknown as Template[];
    },
  });
}

export function useAssignments() {
  return useQuery({
    queryKey: ["template_assignments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("template_assignments").select("id,template_id,category_id,tournament_id");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useTournamentConfig() {
  return useQuery({
    queryKey: ["tournament_config"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tournament_config").select("tournament_id,activation,alert_factor");
      if (error) throw error;
      return new Map((data ?? []).map((r) => [r.tournament_id, { activation: r.activation, alert_factor: Number(r.alert_factor) }]));
    },
  });
}
