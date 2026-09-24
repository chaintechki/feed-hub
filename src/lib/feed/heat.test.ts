import { describe, expect, it } from "vitest";

import { HEAT_WINDOW_MS, heatDir, heatIntensity, heatStyle } from "./heat";

describe("heat", () => {
  const now = Date.parse("2026-09-24T10:00:00Z");
  it("fades linearly over the window", () => {
    expect(heatIntensity(new Date(now).toISOString(), now)).toBe(1);
    expect(heatIntensity(new Date(now - HEAT_WINDOW_MS / 2).toISOString(), now)).toBe(0.5);
    expect(heatIntensity(new Date(now - HEAT_WINDOW_MS).toISOString(), now)).toBe(0);
    expect(heatIntensity(null, now)).toBe(0);
  });
  it("rising = heat (pink), falling = cool (blue)", () => {
    expect(heatDir(2.0, 2.1)).toBe("heat");
    expect(heatDir(2.0, 1.9)).toBe("cool");
    expect(heatDir(2.0, 2.0)).toBeNull();
  });
  it("suspended always grey", () => {
    expect(heatStyle({ dir: "heat", at: new Date(now).toISOString() }, true, now)?.backgroundColor).toContain("--odds-suspended");
    expect(heatStyle(undefined, false, now)).toBeUndefined();
  });
});
