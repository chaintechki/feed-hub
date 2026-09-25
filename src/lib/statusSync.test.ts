import { describe, expect, it } from "vitest";
import { decideStatus, normStatus } from "../../supabase/functions/_shared/status";

const now = Date.parse("2026-09-25T20:00:00Z");
const ago = (h: number) => new Date(now - h * 3600_000).toISOString();

describe("status reconcile", () => {
  it("normalises numeric codes", () => expect(normStatus("4")).toBe("closed"));
  it("ignores recent matches", () => expect(decideStatus("live", ago(1), "ended", now)).toBeNull());
  it("takes the provider's final status", () => expect(decideStatus("live", ago(4), "closed", now)).toEqual({ status: "closed", forced: false }));
  it("forces ended after 12 h", () => expect(decideStatus("not_started", ago(13), "not_started", now)).toEqual({ status: "ended", forced: true }));
  it("keeps finished matches", () => expect(decideStatus("ended", ago(20), null, now)).toBeNull());
  it("follows live status changes", () => expect(decideStatus("not_started", ago(4), "live", now)).toEqual({ status: "live", forced: false }));
});
