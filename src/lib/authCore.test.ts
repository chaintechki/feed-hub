import { describe, expect, it } from "vitest";

import { makeChallenge, passwordValid, pepperPassword, signChallenge, verifyChallenge } from "../../supabase/functions/_shared/auth-core.ts";

describe("password policy", () => {
  it("requires all rules", () => {
    expect(passwordValid("Ab1!xy")).toBe(true);
    expect(passwordValid("Ab1!x")).toBe(false);
    expect(passwordValid("ab1!xy")).toBe(false);
    expect(passwordValid("AB1!XY")).toBe(false);
    expect(passwordValid("Abc!xy")).toBe(false);
    expect(passwordValid("Ab1cxy")).toBe(false);
  });
});

describe("captcha", () => {
  it("accepts correct answer, rejects wrong, tampered, expired", async () => {
    const c = makeChallenge();
    const tok = await signChallenge("s", c, 1000);
    expect((await verifyChallenge("s", tok, c.answer, 2000)).ok).toBe(true);
    expect(await verifyChallenge("s", tok, c.answer + 1, 2000)).toEqual({ ok: false, reason: "wrong" });
    expect(await verifyChallenge("x", tok, c.answer, 2000)).toEqual({ ok: false, reason: "invalid" });
    expect(await verifyChallenge("s", tok, c.answer, 1000 + 3 * 60_000)).toEqual({ ok: false, reason: "expired" });
  });
  it("results are always positive", () => {
    for (let i = 0; i < 500; i++) expect(makeChallenge().answer).toBeGreaterThan(0);
  });
  it("pepper is deterministic and secret-dependent", async () => {
    expect(await pepperPassword("p", "User", "x")).toBe(await pepperPassword("p", "user", "x"));
    expect(await pepperPassword("p", "user", "x")).not.toBe(await pepperPassword("q", "user", "x"));
  });
});
