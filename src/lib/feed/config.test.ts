import { describe, expect, it } from "vitest";

import { keyAt, sortTimeline } from "./config";

describe("template timeline", () => {
  const t = [{ at: 3, key: 103 }, { at: "inst" as const, key: 112 }, { at: 24, key: 106 }];
  it("sorts inst first, then furthest out", () => {
    expect(sortTimeline(t).map((p) => p.at)).toEqual(["inst", 24, 3]);
  });
  it("picks key in effect", () => {
    expect(keyAt(t, 100)).toBe(112);
    expect(keyAt(t, 24)).toBe(106);
    expect(keyAt(t, 2)).toBe(103);
    expect(keyAt([{ at: 24, key: 106 }], 48)).toBeNull();
  });
});
