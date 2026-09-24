import { describe, expect, it } from "vitest";

import { isNewer, isValidInfo, markReload, reloadAttempted } from "./version";

const a = { version: "1.0.1", buildId: "1.0.1-1", buildTime: "2026-09-24T03:00:00Z" };
const b = { version: "1.0.2", buildId: "1.0.2-2", buildTime: "2026-09-24T04:00:00Z" };

describe("version", () => {
  it("detects a different build", () => {
    expect(isNewer(a, b)).toBe(true);
    expect(isNewer(a, a)).toBe(false);
    expect(isNewer(a, null)).toBe(false);
  });
  it("validates payload", () => {
    expect(isValidInfo(a)).toBe(true);
    expect(isValidInfo({ version: 1 })).toBe(false);
  });
  it("remembers reload attempts", () => {
    const m = new Map<string, string>();
    const s = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
    expect(reloadAttempted("x", s)).toBe(false);
    markReload("x", s);
    expect(reloadAttempted("x", s)).toBe(true);
  });
});
