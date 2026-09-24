import { describe, expect, it } from "vitest";

import { formatOdds } from "@/hooks/useOddsFormat";

describe("formatOdds", () => {
  it("renders decimal odds with three digits", () => {
    expect(formatOdds(2.5, "EU")).toBe("2.500");
  });

  it("converts to hong kong odds", () => {
    expect(formatOdds(2.5, "HK")).toBe("1.50");
  });

  it("converts favourites and underdogs to american odds", () => {
    expect(formatOdds(2.5, "US")).toBe("+150");
    expect(formatOdds(1.5, "US")).toBe("-200");
  });

  it("reduces fractional odds", () => {
    expect(formatOdds(2.5, "UK")).toBe("3/2");
  });

  it("guards against missing or invalid odds", () => {
    expect(formatOdds(null, "EU")).toBe("—");
    expect(formatOdds(1, "EU")).toBe("—");
  });
});
