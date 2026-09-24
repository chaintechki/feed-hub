import { describe, expect, it } from "vitest";

import { compare, marketKey, normalizeTo, resolveList } from "./normalize";

describe("normalize", () => {
  it("computes the market key", () => {
    expect(marketKey([1.9, 1.9])).toBeCloseTo(105.3, 1);
    expect(marketKey([2, 2])).toBe(100);
    expect(marketKey([2, null])).toBeNull();
  });
  it("re-prices to a target key", () => {
    const n = normalizeTo([1.8, 1.8], 105);
    expect(marketKey(n)).toBeCloseTo(105, 0);
    expect(n[0]).toBeCloseTo(1.905, 2);
  });
  it("weights and measures strength", () => {
    const c = compare(
      [
        { bookmakerId: "a", name: "A", weight: 3, odds: [1.9, 1.9] },
        { bookmakerId: "b", name: "B", weight: 1, odds: [1.8, 2.0] },
      ],
      105,
      4,
    )!;
    expect(c.books[0]!.bookmakerId).toBe("a");
    expect(c.min[0]).toBeLessThanOrEqual(c.avg[0]!);
    expect(c.max[0]).toBeGreaterThanOrEqual(c.avg[0]!);
    expect(c.strength).toBeGreaterThan(0.5);
    expect(compare([], 105, 4)).toBeNull();
  });
  it("inherits top-down", () => {
    const lists = [{ level: "sport", ref_id: "s" }, { level: "category", ref_id: "c" }];
    expect(resolveList(lists, { sportId: "s", categoryId: "c", tournamentId: "t" })?.from).toBe("category");
    expect(resolveList(lists, { sportId: "s", categoryId: "x", tournamentId: "t" })?.from).toBe("sport");
    expect(resolveList(lists, { sportId: "z", categoryId: "x", tournamentId: "t" })).toBeNull();
  });
});
