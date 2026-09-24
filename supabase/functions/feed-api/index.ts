import {
  buildOpenApi,
  cached,
  clientIp,
  clientScopeKey,
  db,
  errorBody,
  getMarkets,
  getMatches,
  getOutrights,
  getResults,
  getSports,
  overLimit,
  rateHeaders,
  resolveKey,
  roundingMode,
  toXml,
  trackDenial,
  trackMeta,
  etagMatches,
  type ErrorCode,
} from "../_shared/feed.ts";
import { MARKET_GROUPS } from "../_shared/markets.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "x-api-key, content-type, if-none-match",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Expose-Headers": "ETag, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After",
};

const send = (body: string | null, status: number, type: string, extra: Record<string, string> = {}) =>
  new Response(body, {
    status,
    headers: { ...cors, ...(body !== null ? { "Content-Type": type } : {}), "Cache-Control": status === 200 || status === 304 ? "private, max-age=15" : "no-store", ...extra },
  });
const fail = (code: ErrorCode, xml = false, extra: Record<string, string> = {}, detail?: string) => {
  const e = errorBody(code, xml, detail);
  return send(e.body, e.status, e.type, extra);
};

const ENDPOINTS = "/me, /sports, /matches, /matches/{id}/odds, /outrights, /results, /markets, /openapi.json";
const STATUSES = new Set(["not_started", "live", "ended", "closed"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "GET") return fail("method_not_allowed");
  const url = new URL(req.url);
  const format = (url.searchParams.get("format") ?? "json").toLowerCase();
  const xml = format === "xml";
  try {
    const path = url.pathname.replace(/^.*\/feed-api/, "").replace(/\/+$/, "") || "/";
    const base = `${url.protocol}//${url.host}${url.pathname.replace(/\/feed-api.*$/, "")}`.replace(/^http:/, "https:");

    if (path === "/openapi.json") {
      return send(JSON.stringify(buildOpenApi(base), null, 2), 200, "application/json");
    }

    const sb = db();
    if (url.searchParams.has("api_key") || url.searchParams.has("key")) {
      await trackDenial(sb, null, url.searchParams.get("api_key") ?? url.searchParams.get("key"), path, "key_in_query");
      return fail("key_in_query", xml);
    }
    const apiKey = req.headers.get("x-api-key");
    const ip = clientIp(req.headers.get("x-forwarded-for"), req.headers.get("x-real-ip"));
    const r = await resolveKey(sb, apiKey, "server", ip);
    if (!r.ok) {
      await trackDenial(sb, r.client, apiKey, path, r.code);
      return fail(r.code, xml);
    }
    const client = r.client;

    if (!["json", "xml"].includes(format)) {
      await trackDenial(sb, client, apiKey, path, "format_invalid");
      return fail("format_invalid");
    }
    if (!client.formats.includes(format)) {
      await trackDenial(sb, client, apiKey, path, "format_denied");
      return fail("format_denied", false, {}, `Enabled: ${client.formats.join(", ")}`);
    }

    const oddsMatch = path.match(/^\/matches\/([^/]+)\/odds$/);
    const kind =
      path === "/me" ? "me" : path === "/sports" ? "sports" : path === "/matches" ? "matches" : oddsMatch ? "odds" : path === "/outrights" ? "outrights" : path === "/results" ? "results" : path === "/markets" ? "markets" : null;
    if (!kind) {
      await trackDenial(sb, client, apiKey, path, "unknown_endpoint");
      return fail("unknown_endpoint", xml, {}, `Use ${ENDPOINTS}`);
    }

    // Parameter validation (before counting towards the limit)
    const p = url.searchParams;
    const limit = p.has("limit") ? Number(p.get("limit")) : 100;
    const offset = p.has("offset") ? Number(p.get("offset")) : 0;
    const since = p.get("since") ?? undefined;
    const status = p.get("status") ?? undefined;
    const sport = p.get("sport") ?? undefined;
    const tournament = p.get("tournament") ?? undefined;
    const groupsRaw = p.get("groups") ?? "";
    const groups = groupsRaw ? groupsRaw.split(",").map((g) => g.trim()).filter(Boolean) : undefined;
    const lang = (p.get("lang") ?? "en").toLowerCase();
    const bad =
      !Number.isInteger(limit) || limit < 1 || limit > 500 ? "limit must be 1-500."
      : !Number.isInteger(offset) || offset < 0 || offset > 100000 ? "offset must be >= 0."
      : since && Number.isNaN(Date.parse(since)) ? "since must be an ISO date-time."
      : status && !STATUSES.has(status) ? `status must be one of ${[...STATUSES].join(", ")}.`
      : groups && (groups.length > 8 || groups.some((g) => !MARKET_GROUPS.includes(g as never))) ? `groups must be of ${MARKET_GROUPS.join(", ")}.`
      : !["en", "de"].includes(lang) ? "lang must be en or de."
      : [sport, tournament].some((v) => v && v.length > 64) ? "sport/tournament id too long."
      : null;
    if (bad) {
      await trackDenial(sb, client, apiKey, kind, "param_invalid");
      return fail("param_invalid", xml, {}, bad);
    }

    const rate = await overLimit(sb, client, kind);
    const rh = rateHeaders(rate);
    if (rate.limited) {
      await trackDenial(sb, client, apiKey, kind, "rate_limited");
      return fail("rate_limited", xml, rh);
    }

    if (kind === "me") {
      const body = JSON.stringify({
        client: client.name,
        formats: client.formats,
        sport_ids: client.sport_ids,
        tournament_ids: client.tournament_ids,
        market_groups: client.market_groups?.length ? client.market_groups : MARKET_GROUPS,
        rate_limit_per_min: client.rate_limit_per_min,
        remaining: rate.remaining,
        key_expires_at: r.key.expires_at,
      });
      return send(body, 200, "application/json", rh);
    }

    const odds = p.get("odds") !== "false";
    const ck = `api|${clientScopeKey(client)}|${kind}|${path}|${sport ?? ""}|${tournament ?? ""}|${status ?? ""}|${since ?? ""}|${limit}|${offset}|${odds}|${format}|${groups?.join(",") ?? ""}|${lang}`;
    const { body, etag, hit } = await cached(ck, async () => {
      const rounding = await roundingMode(sb);
      let data: unknown[] = [];
      let meta: Record<string, number> | undefined;
      if (kind === "sports") data = await getSports(sb, client);
      else if (kind === "matches") {
        const res = await getMatches(sb, client, { sport, tournament, status, since, withOdds: odds, limit, offset, rounding, groups, lang: lang as "en" | "de" });
        data = res.rows;
        meta = { total: res.total, limit, offset };
      } else if (kind === "odds") {
        data = (await getMatches(sb, client, { id: decodeURIComponent(oddsMatch![1]!), withOdds: true, limit: 1, rounding, groups, lang: lang as "en" | "de" })).rows;
        if (!data.length) return null;
      } else if (kind === "markets") data = await getMarkets(sb, client, lang as "en" | "de");
      else if (kind === "outrights") data = await getOutrights(sb, client, rounding);
      else data = await getResults(sb, client);
      return xml
        ? toXml(kind, data as any[], meta)
        : JSON.stringify({ generated_at: new Date().toISOString(), ...(meta ? { meta } : {}), data });
    });
    if (body === null) {
      await trackDenial(sb, client, apiKey, kind, "not_found");
      return fail("not_found", xml, rh);
    }
    trackMeta(sb, client, kind, hit, body);
    if (etagMatches(req.headers.get("if-none-match"), etag)) return send(null, 304, "", { ...rh, ETag: etag });
    return send(body, 200, xml ? "application/xml; charset=utf-8" : "application/json", { ...rh, ETag: etag });
  } catch (e) {
    console.error(e);
    return fail("server_error", xml);
  }
});
