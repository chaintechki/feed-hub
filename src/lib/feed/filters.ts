import type { MatchRow, MonitorFilters } from "./types";

export function hasUsableOdds(match: MatchRow, source?: "own" | "average") {
  return match.odds.some(
    (row) =>
      (!source || row.source === source) &&
      !row.suspended &&
      row.outcomes.some(
        (outcome) => outcome.active !== false && typeof outcome.odds === "number" && Number.isFinite(outcome.odds),
      ),
  );
}

export function matchesMonitorFilters(
  match: MatchRow,
  filters: MonitorFilters,
  term = "",
  now = Date.now(),
) {
  if (filters.alerted && !match.alerted) return false;
  if (filters.hotlisted && !match.hotlisted) return false;
  if (filters.commented && match.commentCount === 0) return false;
  if (filters.semiAuto && match.controlMode !== "semi_auto") return false;
  if (filters.manual && match.controlMode !== "manual") return false;
  if (filters.controllable && match.controlMode === "locked") return false;
  if (filters.withOdds && !hasUsableOdds(match)) return false;
  if (filters.withOwnOdds && !hasUsableOdds(match, "own")) return false;
  if (filters.hours24) {
    const scheduled = new Date(match.scheduled).getTime();
    if (scheduled < now || scheduled > now + 24 * 3600_000) return false;
  }
  if (filters.providerOnly && !match.providerOnly) return false;
  if (filters.withEarlyOdds && !match.earlyOdds) return false;
  if (filters.earlyOddsAvailable && !match.earlyOdds) return false;

  const query = term.trim().toLowerCase();
  if (query && !`${match.homeTeam} ${match.awayTeam} ${match.tournamentName}`.toLowerCase().includes(query)) {
    return false;
  }
  return true;
}

export function readMonitorFilters(storage: Pick<Storage, "getItem"> | undefined): MonitorFilters {
  if (!storage) return {};
  try {
    const value = JSON.parse(storage.getItem("fp.monitorFilters") ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value as MonitorFilters : {};
  } catch {
    return {};
  }
}