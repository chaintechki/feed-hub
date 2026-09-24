import { describe, expect, it } from "vitest";

import { clientIp, ipAllowed, isExpired, isValidIpRule, priceOdds } from "../../supabase/functions/_shared/api-core.ts";
import { buildOpenApi, toHtml, toMarkdown } from "./apiDocs";

describe("ip whitelist", () => {
  it("empty list allows all", () => expect(ipAllowed("1.2.3.4", [])).toBe(true));
  it("exact and CIDR", () => {
    expect(ipAllowed("203.0.113.10", ["203.0.113.10"])).toBe(true);
    expect(ipAllowed("198.51.100.77", ["198.51.100.0/24"])).toBe(true);
    expect(ipAllowed("198.51.101.1", ["198.51.100.0/24"])).toBe(false);
    expect(ipAllowed("10.1.2.3", ["10.0.0.0/8"])).toBe(true);
    expect(ipAllowed(null, ["10.0.0.0/8"])).toBe(false);
    expect(ipAllowed("2001:db8::1", ["2001:db8::1"])).toBe(true);
  });
  it("validates rules", () => {
    expect(isValidIpRule("1.2.3.4")).toBe(true);
    expect(isValidIpRule("1.2.3.0/24")).toBe(true);
    expect(isValidIpRule("1.2.3.999")).toBe(false);
    expect(isValidIpRule("1.2.3.0/33")).toBe(false);
    expect(isValidIpRule("2001:db8::1")).toBe(true);
    expect(isValidIpRule("example.com")).toBe(false);
  });
  it("takes first forwarded hop", () => expect(clientIp("9.9.9.9, 10.0.0.1")).toBe("9.9.9.9"));
});

describe("expiry", () => {
  it("detects expired keys", () => {
    expect(isExpired(null)).toBe(false);
    expect(isExpired("2000-01-01T00:00:00Z")).toBe(true);
    expect(isExpired(new Date(Date.now() + 60000).toISOString())).toBe(false);
  });
});

describe("pricing", () => {
  it("markup then rounding", () => {
    expect(priceOdds(2, 5)).toBe(2.1);
    expect(priceOdds(2, -5)).toBe(1.9);
    expect(priceOdds(2.2, 3, "betradar")).toBe(2.25); // 2.266 → 0.05 step
    expect(priceOdds(1.0, -10)).toBe(1.01);
  });
});

describe("docs", () => {
  const c = { name: "Acme Bet", sport_ids: ["sr:sport:1"], tournament_ids: [], formats: ["json"], rate_limit_per_min: 120, allowed_domains: ["acme.com"] };
  it("openapi has all endpoints and header auth", () => {
    const s = buildOpenApi("https://x.test/functions/v1", c);
    expect(Object.keys(s.paths)).toEqual(["/me", "/sports", "/matches", "/matches/{id}/odds", "/outrights", "/results"]);
    expect(s.components.securitySchemes.ApiKey).toMatchObject({ in: "header", name: "X-API-Key" });
    expect(s.info.description).toContain("120 requests/minute");
  });
  it("markdown/html are client-specific and contain no keys", () => {
    const md = toMarkdown("https://x.test/functions/v1", "https://panel.test", c);
    expect(md).toContain("Acme Bet");
    expect(md).toContain("acme.com");
    expect(md).not.toMatch(/fpk_live_[A-Za-z0-9]{10}/);
    const html = toHtml(md, "Doc");
    expect(html).toContain("<table>");
    expect(html).toContain("<h1>");
  });
});
