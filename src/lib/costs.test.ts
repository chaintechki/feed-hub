import { describe, expect, it } from "vitest";
import { dailyForecast, dbReads, emptyVolume, GB, hitRate, monthlyForecast, type CostSettings } from "./costs";

const s: CostSettings = {
  currency: "EUR",
  price_per_million_invocations: 2,
  price_per_million_db_reads: 1,
  price_per_gb_egress: 0.1,
  included_invocations: 1_000_000,
  included_egress_gb: 10,
  fixed_monthly: 25,
  upstream_monthly: 100,
};

describe("costs", () => {
  it("hit rate is 0 without traffic", () => {
    expect(hitRate(emptyVolume())).toBe(0);
  });

  it("cache hits reduce db reads", () => {
    expect(dbReads({ allowed: 100, cacheHits: 80, denied: 5, bytes: 0 })).toBe(25);
  });

  it("extrapolates today and averages", () => {
    const d = dailyForecast([{ allowed: 200, cacheHits: 0, denied: 0, bytes: 0 }], { allowed: 50, cacheHits: 0, denied: 0, bytes: 0 }, 12);
    expect(d.allowed).toBe(150);
  });

  it("returns empty forecast without data", () => {
    expect(dailyForecast([], emptyVolume(), 0).allowed).toBe(0);
  });

  it("applies free quotas and fixed costs", () => {
    const m = monthlyForecast({ allowed: 100_000, cacheHits: 100_000, denied: 0, bytes: GB }, s, 30);
    expect(m.invocations).toBe(3_000_000);
    expect(m.invCost).toBeCloseTo(4);
    expect(m.readCost).toBe(0);
    expect(m.egressCost).toBeCloseTo(2);
    expect(m.total).toBeCloseTo(131);
  });
});
