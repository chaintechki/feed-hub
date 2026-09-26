import { describe, expect, it } from "vitest";

import { activeFilterChips, hasUsableOdds, matchesMonitorFilters, readMonitorFilters } from "./filters";
import type { MatchRow } from "./types";

const NOW = Date.parse("2026-09-26T00:00:00Z");
const match = (patch: Partial<MatchRow> = {}): MatchRow => ({
  id: "m1", sportId: "s1", categoryId: "c1", tournamentId: "t1", tournamentName: "League",
  categoryName: "Country", sportName: "Football", homeTeam: "Alpha", awayTeam: "Beta",
  scheduled: "2026-09-26T12:00:00Z", status: "not_started", liveodds: "booked", matchMinute: null,
  booked: true, suspended: false, hotlisted: false, alerted: false, controlMode: "automatic",
  commentCount: 0, earlyOdds: false, providerOnly: false, odds: [], marginSkewed: false,
  alertScore: 0, logCount: 0, heat: {}, ...patch,
});
const odds = (patch = {}) => ({
  source: "own" as const, market: "1x2" as const, specifier: null, margin: null, suspended: false,
  outcomes: [{ label: "1", odds: 2, active: true }], ...patch,
});

describe("monitor filters", () => {
  it("requires an active numeric quote", () => {
    expect(hasUsableOdds(match({ odds: [odds()] }))).toBe(true);
    expect(hasUsableOdds(match({ odds: [odds({ suspended: true })] }))).toBe(false);
    expect(hasUsableOdds(match({ odds: [odds({ outcomes: [{ label: "1", odds: null }] })] }))).toBe(false);
    expect(hasUsableOdds(match({ odds: [odds({ outcomes: [{ label: "1", odds: 2, active: false }] })] }))).toBe(false);
  });

  it("distinguishes own quotes", () => {
    const m = match({ odds: [odds({ source: "average" as const })] });
    expect(matchesMonitorFilters(m, { withOdds: true }, "", NOW)).toBe(true);
    expect(matchesMonitorFilters(m, { withOwnOdds: true }, "", NOW)).toBe(false);
  });

  it("limits 24 hours to future matches", () => {
    expect(matchesMonitorFilters(match(), { hours24: true }, "", NOW)).toBe(true);
    expect(matchesMonitorFilters(match({ scheduled: "2026-09-25T23:00:00Z" }), { hours24: true }, "", NOW)).toBe(false);
    expect(matchesMonitorFilters(match({ scheduled: "2026-09-27T00:00:01Z" }), { hours24: true }, "", NOW)).toBe(false);
  });

  it("live filter keeps only running or interrupted live matches", () => {
    expect(matchesMonitorFilters(match({ status: "live" }), { live: true }, "", NOW)).toBe(true);
    expect(matchesMonitorFilters(match({ status: "suspended" }), { live: true }, "", NOW)).toBe(true);
    expect(matchesMonitorFilters(match({ status: "interrupted" }), { live: true }, "", NOW)).toBe(true);
    expect(matchesMonitorFilters(match({ status: "not_started" }), { live: true }, "", NOW)).toBe(false);
    expect(matchesMonitorFilters(match({ status: "ended" }), { live: true }, "", NOW)).toBe(false);
    // combines with other flags and search
    const m = match({ status: "live", hotlisted: true });
    expect(matchesMonitorFilters(m, { live: true, hotlisted: true }, "alpha", NOW)).toBe(true);
    expect(matchesMonitorFilters(m, { live: true, alerted: true }, "", NOW)).toBe(false);
  });

  it("combines status filters and search", () => {
    const m = match({ alerted: true, hotlisted: true, commentCount: 2, controlMode: "manual", providerOnly: true, earlyOdds: true });
    expect(matchesMonitorFilters(m, { alerted: true, hotlisted: true, commented: true, manual: true, controllable: true, providerOnly: true, withEarlyOdds: true }, "alpha", NOW)).toBe(true);
    expect(matchesMonitorFilters(m, { semiAuto: true }, "", NOW)).toBe(false);
  });

  it("restores valid saved filters and tolerates invalid storage", () => {
    expect(readMonitorFilters({ getItem: () => '{"withOdds":true}' })).toEqual({ withOdds: true });
    expect(readMonitorFilters({ getItem: () => "broken" })).toEqual({});
  });
});
describe("active filter chips", () => {
  it("lists flags, search, tree selection and tab with names", () => {
    const chips = activeFilterChips(
      { withOdds: true, alerted: true, manual: false },
      "  bayern ",
      { sportIds: ["s1"], categoryIds: [], tournamentIds: ["t9"] },
      new Map([["s1", "Soccer"], ["t9", "Bundesliga"]]),
      { id: "t2", name: "Premier League" },
    );
    expect(chips).toEqual([
      { kind: "flag", key: "alerted" },
      { kind: "flag", key: "withOdds" },
      { kind: "term", value: "bayern" },
      { kind: "sport", id: "s1", name: "Soccer" },
      { kind: "tournament", id: "t9", name: "Bundesliga" },
      { kind: "tab", id: "t2", name: "Premier League" },
    ]);
  });

  it("is empty without filters", () => {
    expect(activeFilterChips({}, "", { sportIds: [], categoryIds: [], tournamentIds: [] }, new Map())).toEqual([]);
  });
});
