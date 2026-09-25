// Feed analysis assistant: answers operator questions about matches and odds.
// All tools are read-only and run with the caller's JWT so RLS/visibility apply.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { createOpenAI } from "npm:@ai-sdk/openai@3";
import { convertToModelMessages, stepCountIs, streamText, tool, type UIMessage } from "npm:ai@7";
import { z } from "npm:zod@3";
import { db } from "../_shared/feed.ts";
import { originAllowed, overUserLimit } from "../_shared/guard.ts";
import { createLovableAiGatewayRunIdFetch, getLovableAiGatewayRunId, withLovableAiGatewayRunIdHeader } from "./run-id.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const MODEL = "openai/gpt-6-astra";
const LIMIT_ROWS = 40;

type Outcome = { label?: string; odds?: number | null; active?: boolean };
const usable = (o: { suspended: boolean; outcomes: unknown }) =>
  !o.suspended && Array.isArray(o.outcomes) && (o.outcomes as Outcome[]).some((x) => x.active !== false && typeof x.odds === "number");

function tools(uc: SupabaseClient) {
  const names = async (ids: { sport: string[]; tour: string[] }) => {
    const [s, t] = await Promise.all([
      ids.sport.length ? uc.from("sports").select("id,name").in("id", [...new Set(ids.sport)]) : { data: [] },
      ids.tour.length ? uc.from("tournaments").select("id,name").in("id", [...new Set(ids.tour)].slice(0, 200)) : { data: [] },
    ]);
    return {
      sport: new Map((s.data ?? []).map((r: { id: string; name: string }) => [r.id, r.name])),
      tour: new Map((t.data ?? []).map((r: { id: string; name: string }) => [r.id, r.name])),
    };
  };

  return {
    search_matches: tool({
      description: "Search matches in the loaded feed. Filters are optional. Returns up to 40 matches with a flag whether usable (open, numeric) odds exist.",
      inputSchema: z.object({
        team: z.string().nullable().describe("Part of a team name"),
        sport: z.string().nullable().describe("Sport name, e.g. Soccer, Tennis"),
        tournament: z.string().nullable().describe("Part of a league/tournament name"),
        live_only: z.boolean().nullable(),
        with_odds_only: z.boolean().nullable().describe("Only matches with usable open odds"),
        hours_ahead: z.number().nullable().describe("Only matches starting within the next N hours"),
      }),
      execute: async (a) => {
        let q = uc.from("matches").select("id,home_team,away_team,scheduled,status,match_minute,sport_id,tournament_id,suspended,hotlisted,alerted").order("scheduled").limit(400);
        if (a.team) q = q.or(`home_team.ilike.%${a.team.replace(/[%,()]/g, "")}%,away_team.ilike.%${a.team.replace(/[%,()]/g, "")}%`);
        if (a.live_only) q = q.eq("status", "live");
        else q = q.gte("scheduled", new Date(Date.now() - 3 * 3600_000).toISOString());
        if (a.hours_ahead) q = q.lte("scheduled", new Date(Date.now() + a.hours_ahead * 3600_000).toISOString());
        if (a.sport) {
          const { data } = await uc.from("sports").select("id").ilike("name", `%${a.sport.replace(/[%,()]/g, "")}%`);
          const ids = (data ?? []).map((r) => r.id);
          if (!ids.length) return { total: 0, matches: [] };
          q = q.in("sport_id", ids);
        }
        if (a.tournament) {
          const { data } = await uc.from("tournaments").select("id").ilike("name", `%${a.tournament.replace(/[%,()]/g, "")}%`).limit(150);
          const ids = (data ?? []).map((r) => r.id);
          if (!ids.length) return { total: 0, matches: [] };
          q = q.in("tournament_id", ids);
        }
        const { data: rows, error } = await q;
        if (error) return { error: error.message };
        const ids = (rows ?? []).map((r) => r.id);
        const withOdds = new Set<string>();
        for (let i = 0; i < ids.length; i += 150) {
          const { data } = await uc.from("match_odds").select("match_id,suspended,outcomes").in("match_id", ids.slice(i, i + 150));
          for (const o of data ?? []) if (usable(o)) withOdds.add(o.match_id);
        }
        let list = rows ?? [];
        if (a.with_odds_only) list = list.filter((r) => withOdds.has(r.id));
        const top = list.slice(0, LIMIT_ROWS);
        const n = await names({ sport: top.map((r) => r.sport_id), tour: top.map((r) => r.tournament_id) });
        return {
          total: list.length,
          matches: top.map((r) => ({
            id: r.id,
            match: `${r.home_team} – ${r.away_team}`,
            sport: n.sport.get(r.sport_id) ?? r.sport_id,
            tournament: n.tour.get(r.tournament_id) ?? r.tournament_id,
            scheduled: r.scheduled,
            status: r.status,
            minute: r.match_minute,
            has_odds: withOdds.has(r.id),
            suspended: r.suspended,
            hotlisted: r.hotlisted,
            alerted: r.alerted,
          })),
        };
      },
    }),
    get_match_odds: tool({
      description: "Get markets and odds of one match by its id (e.g. sr:match:123).",
      inputSchema: z.object({ match_id: z.string() }),
      execute: async ({ match_id }) => {
        const [{ data: m }, { data: odds, error }] = await Promise.all([
          uc.from("matches").select("id,home_team,away_team,scheduled,status").eq("id", match_id).maybeSingle(),
          uc.from("match_odds").select("market,specifier,source,suspended,outcomes").eq("match_id", match_id).order("market").limit(60),
        ]);
        if (error) return { error: error.message };
        if (!m) return { error: "Match not found" };
        return {
          match: `${m.home_team} – ${m.away_team}`,
          scheduled: m.scheduled,
          status: m.status,
          markets: (odds ?? []).map((o) => ({
            market: o.market,
            specifier: o.specifier,
            source: o.source,
            suspended: o.suspended,
            outcomes: ((o.outcomes as Outcome[]) ?? []).map((x) => ({ label: x.label, odds: x.odds ?? null, active: x.active !== false })),
          })),
        };
      },
    }),
    feed_summary: tool({
      description: "Overall feed counts for upcoming/live matches: total, live, with usable odds, suspended, per sport (top 15).",
      inputSchema: z.object({ hours_ahead: z.number().nullable() }),
      execute: async ({ hours_ahead }) => {
        const from = new Date(Date.now() - 3 * 3600_000).toISOString();
        const to = new Date(Date.now() + (hours_ahead ?? 48) * 3600_000).toISOString();
        const rows: { id: string; sport_id: string; status: string; suspended: boolean }[] = [];
        for (let p = 0; p < 20; p++) {
          const { data, error } = await uc.from("matches").select("id,sport_id,status,suspended").gte("scheduled", from).lte("scheduled", to).range(p * 1000, p * 1000 + 999);
          if (error) return { error: error.message };
          rows.push(...(data ?? []));
          if ((data ?? []).length < 1000) break;
        }
        const withOdds = new Set<string>();
        const ids = rows.map((r) => r.id);
        for (let i = 0; i < ids.length; i += 200) {
          const { data } = await uc.from("match_odds").select("match_id,suspended,outcomes").in("match_id", ids.slice(i, i + 200)).eq("suspended", false);
          for (const o of data ?? []) if (usable(o)) withOdds.add(o.match_id);
        }
        const per = new Map<string, { total: number; with_odds: number; live: number }>();
        for (const r of rows) {
          const e = per.get(r.sport_id) ?? { total: 0, with_odds: 0, live: 0 };
          e.total++;
          if (withOdds.has(r.id)) e.with_odds++;
          if (r.status === "live") e.live++;
          per.set(r.sport_id, e);
        }
        const top = [...per.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 15);
        const n = await names({ sport: top.map(([id]) => id), tour: [] });
        return {
          window_hours: hours_ahead ?? 48,
          total: rows.length,
          live: rows.filter((r) => r.status === "live").length,
          with_odds: withOdds.size,
          suspended: rows.filter((r) => r.suspended).length,
          per_sport: top.map(([id, v]) => ({ sport: n.sport.get(id) ?? id, ...v })),
        };
      },
    }),
  };
}

const SYSTEM = `You are the feed analysis assistant of a sports odds feed panel. Operators ask about matches and odds.
Always use the tools to look up data; never invent matches or odds. Answer in the user's language (German or English).
Summarise clearly and briefly: key numbers first, then a compact markdown table of relevant matches (match, league, start in local time Europe/Berlin, status, odds yes/no).
For each listed match add a link in the form [Details](/monitoring/match/<id>). If nothing is found, say so and suggest a broader search.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!originAllowed(req)) return json({ error: "Forbidden origin" }, 403);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const uc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false },
    });
    const { data: cl, error: ce } = await uc.auth.getClaims(auth.slice(7));
    if (ce || !cl?.claims?.sub) return json({ error: "Unauthorized" }, 401);
    const me = cl.claims.sub as string;
    const sb = db();
    if (await overUserLimit(sb, me, "feed-assistant", 10)) return json({ error: "Zu viele Anfragen – bitte kurz warten." }, 429);

    const body = await req.json().catch(() => null);
    const incoming = body?.messages as UIMessage[] | undefined;
    const last = incoming?.[incoming.length - 1];
    if (!last || last.role !== "user") return json({ error: "Invalid request" }, 400);
    const text = last.parts?.map((p) => (p.type === "text" ? p.text : "")).join("") ?? "";
    if (!text.trim() || text.length > 2000) return json({ error: "Frage leer oder zu lang (max. 2000 Zeichen)." }, 400);

    // History comes from the database, not from the client.
    const { data: stored, error: he } = await sb.from("ai_chat_messages").select("message_id,role,parts").eq("user_id", me).order("created_at").limit(40);
    if (he) throw he;
    const history: UIMessage[] = (stored ?? []).map((r) => ({ id: r.message_id, role: r.role as UIMessage["role"], parts: r.parts as UIMessage["parts"] }));
    const userMsg: UIMessage = { id: last.id, role: "user", parts: [{ type: "text", text }] };
    const { error: ie } = await sb.from("ai_chat_messages").upsert({ user_id: me, message_id: userMsg.id, role: "user", parts: userMsg.parts }, { onConflict: "user_id,message_id" });
    if (ie) throw ie;
    const messages = [...history.filter((m) => m.id !== userMsg.id), userMsg];

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "KI nicht konfiguriert" }, 500);
    const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(req));
    const provider = createOpenAI({
      baseURL: "https://ai.gateway.lovable.dev/v1",
      apiKey,
      headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
      fetch: runIdFetch.fetch,
    });
    const result = streamText({
      model: provider.responses(MODEL),
      system: SYSTEM,
      messages: await convertToModelMessages(messages),
      tools: tools(uc),
      stopWhen: stepCountIs(50),
      abortSignal: req.signal,
      providerOptions: {
        openai: {
          forceReasoning: true,
          reasoningEffort: "low",
          reasoningSummary: "auto",
          store: false,
          include: ["reasoning.encrypted_content"],
        },
      },
    });
    const response = result.toUIMessageStreamResponse({
      originalMessages: messages,
      sendReasoning: true,
      onFinish: async ({ responseMessage }) => {
        const { error } = await sb.from("ai_chat_messages").upsert(
          { user_id: me, message_id: responseMessage.id, role: "assistant", parts: responseMessage.parts },
          { onConflict: "user_id,message_id" },
        );
        if (error) console.error("persist assistant failed", error.message);
      },
      onError: (e) => {
        console.error("assistant stream error", e);
        const msg = String((e as { message?: string })?.message ?? "");
        if (msg.includes("402")) return "KI-Guthaben aufgebraucht.";
        if (msg.includes("429")) return "KI-Dienst ausgelastet – bitte später erneut versuchen.";
        return "Die Analyse ist fehlgeschlagen.";
      },
    });
    return withLovableAiGatewayRunIdHeader(response, runIdFetch, cors);
  } catch (e) {
    console.error(e);
    return json({ error: "Internal error" }, 500);
  }
});
