/**
 * Dependency-free core shared by the edge functions (Deno) and the panel (Vite).
 * Keep this file free of imports.
 */

/* ---------- Access control ---------- */
function ipv4ToInt(ip: string): number | null {
  const p = ip.split(".");
  if (p.length !== 4) return null;
  let n = 0;
  for (const s of p) {
    if (!/^\d{1,3}$/.test(s)) return null;
    const v = Number(s);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

/** Empty list = any IP. Supports exact IPv4/IPv6 and IPv4 CIDR (e.g. 203.0.113.0/24). */
export function ipAllowed(ip: string | null, allowed: string[]): boolean {
  const list = allowed.map((a) => a.trim()).filter(Boolean);
  if (!list.length) return true;
  if (!ip) return false;
  const addr = ip.trim().toLowerCase();
  const n = ipv4ToInt(addr);
  return list.some((rule) => {
    const r = rule.toLowerCase();
    if (!r.includes("/")) return r === addr;
    const [base, bitsS] = r.split("/") as [string, string];
    const bits = Number(bitsS);
    const b = ipv4ToInt(base);
    if (n === null || b === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
    if (bits === 0) return true;
    const mask = 2 ** 32 - 2 ** (32 - bits);
    return Math.floor(n / 2 ** (32 - bits)) === Math.floor(b / 2 ** (32 - bits)) && (n & mask) >>> 0 === (b & mask) >>> 0;
  });
}

export function isValidIpRule(rule: string): boolean {
  const r = rule.trim();
  if (/^[0-9a-f:]+$/i.test(r) && r.includes(":")) return true; // IPv6 exact
  const [base, bits] = r.split("/");
  if (ipv4ToInt(base ?? "") === null) return false;
  return bits === undefined || (/^\d{1,2}$/.test(bits) && Number(bits) <= 32);
}

export const isExpired = (expiresAt: string | null | undefined, now = Date.now()) =>
  !!expiresAt && new Date(expiresAt).getTime() <= now;

/** First hop of x-forwarded-for (client IP as seen by the edge). */
export const clientIp = (xff: string | null, fallback: string | null = null) =>
  xff?.split(",")[0]?.trim() || fallback;

/* ---------- Odds rounding (CTRL Feed Options Live) ---------- */
export type RoundingMode = "betradar" | "low_key" | "none";
type Band = [upTo: number, step: number];
const BANDS: Record<Exclude<RoundingMode, "none">, Band[]> = {
  betradar: [[1.1, 0.01], [1.145, 0.02], [1.155, 0], [1.235, 0.02], [5, 0.05], [20, 0.25], [Infinity, 1]],
  low_key: [[2, 0.01], [3, 0.02], [4, 0.05], [6, 0.1], [10, 0.2], [20, 0.5], [30, 1], [Infinity, 5]],
};
export function roundOdds(odds: number, mode: RoundingMode): number {
  if (!Number.isFinite(odds) || mode === "none" || !(mode in BANDS)) return odds;
  const v = Math.max(1.01, odds);
  for (const [upTo, step] of BANDS[mode]) {
    if (v <= upTo) {
      if (step === 0) return 1.15;
      return Math.max(1.01, Math.round(Math.round(v / step) * step * 100) / 100);
    }
  }
  return v;
}

/** Markup (+ = better odds for the customer) followed by rounding. */
export const priceOdds = (odds: number, markupPct: number, mode: RoundingMode = "none") =>
  roundOdds(Math.max(1.01, Math.round(odds * (1 + (Number(markupPct) || 0) / 100) * 100) / 100), mode);

/* ---------- Error codes ---------- */
export const ERROR_CODES = {
  key_missing: [401, "API key missing. Send it in the X-API-Key header."],
  key_in_query: [400, "API keys must not be sent in the URL. Use the X-API-Key header."],
  invalid_key: [401, "Invalid or inactive API key."],
  key_expired: [401, "API key expired."],
  ip_denied: [403, "Request IP is not whitelisted for this key."],
  domain_denied: [403, "Origin domain is not allowed for this widget key."],
  format_invalid: [400, "format must be json or xml."],
  format_denied: [403, "Format not enabled for this client."],
  param_invalid: [400, "Invalid query parameter."],
  unknown_endpoint: [404, "Unknown endpoint."],
  not_found: [404, "Resource not found."],
  rate_limited: [429, "Rate limit exceeded. Retry after the time given in Retry-After."],
  method_not_allowed: [405, "Only GET is supported."],
  server_error: [500, "Internal server error."],
} as const;
export type ErrorCode = keyof typeof ERROR_CODES;

/* ---------- OpenAPI 3.1 ---------- */
export type DocClient = {
  name: string;
  sport_ids: string[];
  tournament_ids: string[];
  formats: string[];
  rate_limit_per_min: number;
  allowed_domains: string[];
};

const errSchema = { $ref: "#/components/schemas/Error" };
const fmtParam = { name: "format", in: "query", schema: { type: "string", enum: ["json", "xml"], default: "json" } };
const stdResponses = (ok: Record<string, unknown>) => ({
  "200": {
    description: "OK",
    headers: {
      ETag: { schema: { type: "string" } },
      "X-RateLimit-Limit": { schema: { type: "integer" } },
      "X-RateLimit-Remaining": { schema: { type: "integer" } },
      "X-RateLimit-Reset": { schema: { type: "integer" }, description: "Unix seconds when the window resets" },
    },
    content: { "application/json": { schema: ok }, "application/xml": { schema: { type: "string" } } },
  },
  "304": { description: "Not modified (If-None-Match matched ETag)" },
  "400": { description: "Bad request", content: { "application/json": { schema: errSchema } } },
  "401": { description: "Missing, invalid or expired key", content: { "application/json": { schema: errSchema } } },
  "403": { description: "IP / format not allowed", content: { "application/json": { schema: errSchema } } },
  "404": { description: "Not found", content: { "application/json": { schema: errSchema } } },
  "429": { description: "Rate limited", headers: { "Retry-After": { schema: { type: "integer" } } }, content: { "application/json": { schema: errSchema } } },
});
const list = (item: string, meta = false) => ({
  type: "object",
  required: ["generated_at", "data"],
  properties: {
    generated_at: { type: "string", format: "date-time" },
    data: { type: "array", items: { $ref: `#/components/schemas/${item}` } },
    ...(meta ? { meta: { $ref: "#/components/schemas/PageMeta" } } : {}),
  },
});

export function buildOpenApi(baseUrl: string, client?: DocClient | null) {
  const desc = [
    "Pull-based odds feed. Authenticate server requests with the `X-API-Key` header (never in the URL).",
    "Responses are cached for 15 s; use `If-None-Match` with the returned `ETag` to receive `304 Not Modified`.",
    "Every response carries `X-RateLimit-*` headers; on `429` wait `Retry-After` seconds.",
    ...(client
      ? [
          "",
          `**Client:** ${client.name}`,
          `**Rate limit:** ${client.rate_limit_per_min} requests/minute`,
          `**Formats:** ${client.formats.join(", ")}`,
          `**Sports:** ${client.sport_ids.length ? client.sport_ids.join(", ") : "all"}`,
          `**Tournaments:** ${client.tournament_ids.length ? client.tournament_ids.join(", ") : "all within sports"}`,
          `**Widget domains:** ${client.allowed_domains.length ? client.allowed_domains.join(", ") : "none"}`,
        ]
      : []),
  ].join("\n");

  return {
    openapi: "3.1.0",
    info: { title: "Feed Panel Odds API", version: "1.1.0", description: desc },
    servers: [{ url: `${baseUrl}/feed-api` }],
    security: [{ ApiKey: [] }],
    paths: {
      "/me": { get: { summary: "Current client, entitlements and remaining quota", parameters: [], responses: stdResponses({ $ref: "#/components/schemas/Me" }) } },
      "/sports": { get: { summary: "Sport tree (sports → categories → tournaments)", parameters: [fmtParam], responses: stdResponses(list("Sport")) } },
      "/matches": {
        get: {
          summary: "Matches with odds, paginated",
          parameters: [
            fmtParam,
            { name: "sport", in: "query", schema: { type: "string" }, example: "sr:sport:1" },
            { name: "tournament", in: "query", schema: { type: "string" }, example: "sr:tournament:17" },
            { name: "status", in: "query", schema: { type: "string", enum: ["not_started", "live", "ended", "closed"] } },
            { name: "since", in: "query", schema: { type: "string", format: "date-time" }, description: "Only matches updated since this time" },
            { name: "odds", in: "query", schema: { type: "boolean", default: true }, description: "false = schedule only" },
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 500, default: 100 } },
            { name: "offset", in: "query", schema: { type: "integer", minimum: 0, default: 0 } },
          ],
          responses: stdResponses(list("Match", true)),
        },
      },
      "/matches/{id}/odds": {
        get: {
          summary: "Single match with all active markets",
          parameters: [fmtParam, { name: "id", in: "path", required: true, schema: { type: "string" }, example: "sr:match:41001" }],
          responses: stdResponses(list("Match")),
        },
      },
      "/outrights": { get: { summary: "Published outrights with competitor odds", parameters: [fmtParam], responses: stdResponses(list("Outright")) } },
      "/results": { get: { summary: "Settled markets (latest 500)", parameters: [fmtParam], responses: stdResponses(list("Result")) } },
    },
    components: {
      securitySchemes: { ApiKey: { type: "apiKey", in: "header", name: "X-API-Key" } },
      schemas: {
        Error: {
          type: "object",
          properties: { error: { type: "object", properties: { code: { type: "string", enum: Object.keys(ERROR_CODES) }, message: { type: "string" } } } },
        },
        PageMeta: { type: "object", properties: { total: { type: "integer" }, limit: { type: "integer" }, offset: { type: "integer" } } },
        Me: {
          type: "object",
          properties: {
            client: { type: "string" },
            formats: { type: "array", items: { type: "string" } },
            sport_ids: { type: "array", items: { type: "string" } },
            tournament_ids: { type: "array", items: { type: "string" } },
            rate_limit_per_min: { type: "integer" },
            remaining: { type: "integer" },
            key_expires_at: { type: ["string", "null"], format: "date-time" },
          },
        },
        Sport: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            categories: { type: "array", items: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, country_code: { type: ["string", "null"] }, tournaments: { type: "array", items: { type: "object", properties: { id: { type: "string" }, name: { type: "string" } } } } } } },
          },
        },
        Outcome: { type: "object", properties: { id: { type: "string" }, odds: { type: "number" } } },
        Market: {
          type: "object",
          properties: { market: { type: "string" }, specifier: { type: ["string", "null"] }, active: { type: "boolean" }, updated_at: { type: "string", format: "date-time" }, outcomes: { type: "array", items: { $ref: "#/components/schemas/Outcome" } } },
        },
        Match: {
          type: "object",
          properties: {
            id: { type: "string" }, sport_id: { type: "string" }, category_id: { type: "string" }, tournament_id: { type: "string" },
            home_team: { type: "string" }, away_team: { type: "string" }, scheduled: { type: "string", format: "date-time" },
            status: { type: "string" }, match_minute: { type: ["integer", "null"] }, updated_at: { type: "string", format: "date-time" },
            markets: { type: "array", items: { $ref: "#/components/schemas/Market" } },
          },
        },
        Outright: {
          type: "object",
          properties: { id: { type: "string" }, tournament_id: { type: "string" }, name: { type: "string" }, scheduled: { type: ["string", "null"] }, status: { type: "string" }, competitors: { type: "array", items: { type: "object", properties: { name: { type: "string" }, odds: { type: "number" } } } } },
        },
        Result: {
          type: "object",
          properties: { match_id: { type: "string" }, market: { type: "string" }, specifier: { type: ["string", "null"] }, outcome: { type: "string" }, settled_at: { type: "string", format: "date-time" } },
        },
      },
    },
  };
}
