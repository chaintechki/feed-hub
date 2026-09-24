export type Outcome = {
  label: string;
  odds: number | null;
  trend?: "up" | "down" | null;
  active?: boolean;
};

export type OddsRow = {
  source: "own" | "average";
  market: "1x2" | "total" | "handicap";
  specifier: string | null;
  outcomes: Outcome[];
  margin: number | null;
  suspended?: boolean;
  controlMode?: string;
  group?: string;
  alerted?: boolean;
  updatedAt?: string;
};

export type MatchRow = {
  id: string;
  sportId: string;
  categoryId: string;
  tournamentId: string;
  tournamentName: string;
  categoryName: string;
  sportName: string;
  homeTeam: string;
  awayTeam: string;
  scheduled: string;
  status: string;
  liveodds: string;
  matchMinute: number | null;
  booked: boolean;
  suspended: boolean;
  hotlisted: boolean;
  alerted: boolean;
  controlMode: string;
  commentCount: number;
  earlyOdds: boolean;
  providerOnly: boolean;
  odds: OddsRow[];
  marginSkewed: boolean;
  alertScore: number;
  logCount: number;
  heat: Record<string, import("./heat").Heat>;
};

export type TreeTournament = { id: string; name: string; matchCount: number; alerts: number };
export type TreeCategory = {
  id: string;
  name: string;
  matchCount: number;
  alerts: number;
  tournaments: TreeTournament[];
};
export type TreeSport = {
  id: string;
  name: string;
  matchCount: number;
  alerts: number;
  hot: number;
  categories: TreeCategory[];
};

export const MONITOR_FILTER_KEYS = [
  "alerted",
  "semiAuto",
  "manual",
  "hotlisted",
  "commented",
  "withOdds",
  "withOwnOdds",
  "controllable",
  "hours24",
  "providerOnly",
  "earlyOddsAvailable",
  "withEarlyOdds",
] as const;

export type MonitorFilterKey = (typeof MONITOR_FILTER_KEYS)[number];
export type MonitorFilters = Partial<Record<MonitorFilterKey, boolean>>;

export type LeagueTab = { id: string; name: string };
