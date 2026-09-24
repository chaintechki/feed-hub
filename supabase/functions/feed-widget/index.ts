import { db, getMatches, overLimit, resolveKey, trackDenial } from "../_shared/feed.ts";

function hostAllowed(origin: string | null, allowed: string[]) {
  if (!origin) return false;
  let host: string;
  try { host = new URL(origin).hostname.toLowerCase(); } catch { return false; }
  return allowed.some((d) => {
    const dd = d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    return dd && (host === dd || host.endsWith("." + dd));
  });
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const cors = {
    "Access-Control-Allow-Origin": origin ?? "null",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    Vary: "Origin",
  };
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = new URL(req.url);
    const sb = db();
    const key = url.searchParams.get("key");
    const client = await resolveKey(sb, key, "widget");
    if (!client) {
      await trackDenial(sb, null, key, "widget", "invalid_key");
      return json({ error: "Invalid widget key" }, 401);
    }
    if (!hostAllowed(origin, client.allowed_domains)) {
      await trackDenial(sb, client, key, "widget", "domain_denied");
      return json({ error: "Domain not allowed" }, 403);
    }
    if (await overLimit(sb, client, "widget")) {
      await trackDenial(sb, client, key, "widget", "rate_limited");
      return json({ error: "Rate limit exceeded" }, 429);
    }
    const data = await getMatches(sb, client, { sport: url.searchParams.get("sport") ?? undefined, withOdds: true });
    return json({ data: data.filter((m: any) => m.status !== "ended" && m.status !== "closed") });
  } catch (e) {
    console.error(e);
    return json({ error: "Server error" }, 500);
  }
});
