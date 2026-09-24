import { describe, expect, it } from "vitest";

import { harmonise, roundOdds } from "./rounding";

describe("rounding", () => {
  it("betradar bands", () => {
    expect(roundOdds(1.057, "betradar")).toBe(1.06);
    expect(roundOdds(1.123, "betradar")).toBe(1.12);
    expect(roundOdds(1.15, "betradar")).toBe(1.15);
    expect(roundOdds(2.27, "betradar")).toBe(2.25);
    expect(roundOdds(7.1, "betradar")).toBe(7);
    expect(roundOdds(23.4, "betradar")).toBe(23);
  });
  it("low key bands", () => {
    expect(roundOdds(1.567, "low_key")).toBe(1.57);
    expect(roundOdds(2.27, "low_key")).toBe(2.28);
    expect(roundOdds(4.33, "low_key")).toBe(4.3);
    expect(roundOdds(12.3, "low_key")).toBe(12.5);
  });
  it("none leaves odds untouched", () => expect(roundOdds(2.237, "none")).toBe(2.237));
  it("harmonises (docs example)", () => {
    expect(harmonise([2.2, 2.27], "lowest")).toEqual([2.2, 2.2]);
    expect(harmonise([2.2, 2.27], "highest")).toEqual([2.27, 2.27]);
    expect(harmonise([2.2, 2.27], "average")).toEqual([2.235, 2.235]);
  });
});
