import { setCacheSource } from "../_shared/cache-stats.ts";
import { cached, clientScopeKey, db, errorBody, getMatches, overLimit, rateHeaders, resolveKey, roundingMode, trackDenial, trackMeta, etagMatches, type ErrorCode } from "../_shared/feed.ts";

function hostAllowed(origin: string | null, allowed: string[]) {
  if (!origin) return false;
  let host: string;
  try { host = new URL(origin).hostname.toLowerCase(); } catch { return false; }
  return allowed.some((d) => {
    const dd = d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    return dd && (host === dd || host.endsWith("." + dd));
  });
}

setCacheSource("feed-widget");
Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const cors = {
    "Access-Control-Allow-Origin": origin ?? "null",
    "Access-Control-Allow-Headers": "content-type, if-none-match",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Expose-Headers": "ETag, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After",
    Vary: "Origin",
  };
  const fail = (code: ErrorCode, extra: Record<string, string> = {}) => {
    const e = errorBody(code);
    return new Response(e.body, { status: e.status, headers: { ...cors, ...extra, "Content-Type": e.type, "Cache-Control": "no-store" } });
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "GET") return fail("method_not_allowed");
  try {
    const url = new URL(req.url);
    const sb = db();
    const key = url.searchParams.get("key");
    const r = await resolveKey(sb, key, "widget");
    if (!r.ok) {
      await trackDenial(sb, r.client, key, "widget", r.code);
      return fail(r.code);
    }
    const client = r.client;
    if (!hostAllowed(origin, client.allowed_domains)) {
      await trackDenial(sb, client, key, "widget", "domain_denied");
      return fail("domain_denied");
    }
    const rate = await overLimit(sb, client, "widget");
    const rh = rateHeaders(rate);
    if (rate.limited) {
      await trackDenial(sb, client, key, "widget", "rate_limited");
      return fail("rate_limited", rh);
    }
    const sport = url.searchParams.get("sport") ?? undefined;
    if (sport && sport.length > 64) return fail("param_invalid");
    const { body, etag, hit } = await cached(`widget|${clientScopeKey(client)}|${sport ?? ""}`, async () => {
      const { rows } = await getMatches(sb, client, { sport, withOdds: true, limit: 200, rounding: await roundingMode(sb) });
      return JSON.stringify({ data: rows.filter((m: any) => m.status !== "ended" && m.status !== "closed") });
    });
    trackMeta(sb, client, "widget", hit, body!);
    const h = { ...cors, ...rh, ETag: etag, "Cache-Control": "private, max-age=15" };
    if (etagMatches(req.headers.get("if-none-match"), etag)) return new Response(null, { status: 304, headers: h });
    return new Response(body, { status: 200, headers: { ...h, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return fail("server_error");
  }
});
