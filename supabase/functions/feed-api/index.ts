import { db, getMatches, getOutrights, getResults, getSports, overLimit, resolveKey, toXml, trackDenial } from "../_shared/feed.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "x-api-key, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const reply = (body: string, status: number, type: string) =>
  new Response(body, {
    status,
    headers: { ...cors, "Content-Type": type, "Cache-Control": status === 200 ? "public, max-age=15" : "no-store" },
  });
const err = (msg: string, status: number) => reply(JSON.stringify({ error: msg }), status, "application/json");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "GET") return err("Method not allowed", 405);
  try {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^.*\/feed-api/, "").replace(/\/+$/, "") || "/";
    const apiKey = req.headers.get("x-api-key") ?? url.searchParams.get("api_key");
    const sb = db();
    const client = await resolveKey(sb, apiKey, "server");
    if (!client) {
      await trackDenial(sb, null, apiKey, path, "invalid_key");
      return err("Invalid or inactive API key", 401);
    }

    const format = (url.searchParams.get("format") ?? "json").toLowerCase();
    if (!["json", "xml"].includes(format)) {
      await trackDenial(sb, client, apiKey, path, "unknown_endpoint");
      return err("format must be json or xml", 400);
    }
    if (!client.formats.includes(format)) {
      await trackDenial(sb, client, apiKey, path, "format_denied");
      return err(`Format ${format} not enabled for this client`, 403);
    }

    let kind: string;
    let data: unknown[];
    const sport = url.searchParams.get("sport") ?? undefined;
    const oddsMatch = path.match(/^\/matches\/([^/]+)\/odds$/);
    if (path === "/sports") { kind = "sports"; }
    else if (path === "/matches") { kind = "matches"; }
    else if (oddsMatch) { kind = "odds"; }
    else if (path === "/outrights") { kind = "outrights"; }
    else if (path === "/results") { kind = "results"; }
    else {
      await trackDenial(sb, client, apiKey, path, "unknown_endpoint");
      return err("Unknown endpoint. Use /sports, /matches, /matches/{id}/odds, /outrights, /results", 404);
    }

    if (await overLimit(sb, client, kind)) {
      await trackDenial(sb, client, apiKey, kind, "rate_limited");
      return err("Rate limit exceeded", 429);
    }

    if (kind === "sports") data = await getSports(sb, client);
    else if (kind === "matches")
      data = await getMatches(sb, client, { sport, withOdds: url.searchParams.get("odds") !== "false" });
    else if (kind === "odds") {
      data = await getMatches(sb, client, { id: decodeURIComponent(oddsMatch![1]), withOdds: true });
      if (!data.length) {
        await trackDenial(sb, client, apiKey, kind, "not_found");
        return err("Match not found", 404);
      }
    } else if (kind === "outrights") data = await getOutrights(sb, client);
    else data = await getResults(sb, client);

    return format === "xml"
      ? reply(toXml(kind, data as any[]), 200, "application/xml; charset=utf-8")
      : reply(JSON.stringify({ generated_at: new Date().toISOString(), data }), 200, "application/json");
  } catch (e) {
    console.error(e);
    return err("Server error", 500);
  }
});
