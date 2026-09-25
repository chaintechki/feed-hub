// Feed analysis assistant: answers operator questions about matches and odds.
// All tools are read-only and run with the caller's JWT so RLS/visibility apply.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { createOpenAI } from "npm:@ai-sdk/openai@4";
import { convertToModelMessages, stepCountIs, streamText, tool, type UIMessage } from "npm:ai@7";
import { z } from "npm:zod@3";
import { db } from "../_shared/feed.ts";
import { originAllowed, overUserLimit } from "../_shared/guard.ts";
import { EVAL_SET, leagueName, marketKey, resolveGerman, sportName } from "../_shared/de-sports.ts";
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
      description: "Search matches in the loaded feed. Filters are optional; German terms are accepted (Fußball, Eishockey, Bundesliga, DEL, Über/Unter, Beide treffen …). Returns up to 40 matches with a flag whether usable (open, numeric) odds exist.",
      inputSchema: z.object({
        team: z.string().nullable().describe("Part of a team name"),
        sport: z.string().nullable().describe("Sport name, German or English, e.g. Fußball/Soccer, Tennis, Eishockey"),
        tournament: z.string().nullable().describe("League/tournament name, German or English, e.g. Bundesliga, 2. Bundesliga, DFB-Pokal, DEL"),
        country: z.string().nullable().describe("Country of the league in English, e.g. Germany, England"),
        market: z.string().nullable().describe("Only matches with open odds in this market: 1x2, total (Über/Unter), btts (Beide treffen), double_chance, handicap, ht_1x2"),
        live_only: z.boolean().nullable(),
        with_odds_only: z.boolean().nullable().describe("Only matches with usable open odds"),
        hours_ahead: z.number().nullable().describe("Only matches starting within the next N hours"),
      }),
      execute: async (a) => {
        const clean = (s: string) => s.replace(/[%,()]/g, "").trim();
        let q = uc.from("matches").select("id,home_team,away_team,scheduled,status,match_minute,sport_id,tournament_id,suspended,hotlisted,alerted").in("status", ["not_started", "live", "suspended", "delayed", "interrupted"]).order("scheduled").limit(400);
        if (a.team) q = q.or(`home_team.ilike.%${clean(a.team)}%,away_team.ilike.%${clean(a.team)}%`);
        if (a.live_only) q = q.eq("status", "live");
        else q = q.gte("scheduled", new Date(Date.now() - 3 * 3600_000).toISOString());
        if (a.hours_ahead) q = q.lte("scheduled", new Date(Date.now() + a.hours_ahead * 3600_000).toISOString());
        let sportIds: string[] | null = null;
        if (a.sport) {
          const { data } = await uc.from("sports").select("id,name").ilike("name", `%${clean(sportName(a.sport))}%`);
          const exact = (data ?? []).filter((r) => r.name.toLowerCase() === sportName(a.sport!).toLowerCase());
          sportIds = (exact.length ? exact : data ?? []).map((r) => r.id);
          if (!sportIds.length) return { total: 0, matches: [], hint: `Sportart „${a.sport}" nicht gefunden` };
          q = q.in("sport_id", sportIds);
        }
        if (a.tournament) {
          const lg = leagueName(a.tournament);
          let tq = uc.from("tournaments").select("id,name,category_id").ilike("name", `%${clean(lg.name)}%`).limit(150);
          if (sportIds) tq = tq.in("sport_id", sportIds);
          const { data } = await tq;
          let tours = data ?? [];
          const country = a.country ?? lg.country;
          if (country && tours.length > 1) {
            const { data: cats } = await uc.from("categories").select("id").ilike("name", `%${clean(country)}%`);
            const cs = new Set((cats ?? []).map((c) => c.id));
            const inCountry = tours.filter((t) => cs.has(t.category_id));
            if (inCountry.length) tours = inCountry;
          }
          const exact = tours.filter((t) => t.name.toLowerCase() === lg.name.toLowerCase());
          if (exact.length) tours = exact;
          const ids = tours.map((r) => r.id);
          if (!ids.length) return { total: 0, matches: [], hint: `Liga „${a.tournament}" nicht gefunden` };
          q = q.in("tournament_id", ids);
        }
        const { data: rows, error } = await q;
        if (error) return { error: error.message };
        const ids = (rows ?? []).map((r) => r.id);
        const withOdds = new Set<string>();
        const inMarket = new Set<string>();
        const mk = a.market ? marketKey(a.market) : null;
        for (let i = 0; i < ids.length; i += 150) {
          const { data } = await uc.from("match_odds").select("match_id,market,suspended,outcomes").in("match_id", ids.slice(i, i + 150));
          for (const o of data ?? []) if (usable(o)) { withOdds.add(o.match_id); if (mk && o.market === mk) inMarket.add(o.match_id); }
        }
        let list = rows ?? [];
        if (a.with_odds_only) list = list.filter((r) => withOdds.has(r.id));
        if (mk) list = list.filter((r) => inMarket.has(r.id));
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

const SYSTEM = `You are the feed analysis assistant of a sports odds feed panel. Operators ask about matches and odds, mostly in German.
Always use the tools to look up data; never invent matches or odds. Answer in the user's language (German or English).
German vocabulary: Fußball=Soccer, Eishockey=Ice Hockey, Tischtennis=Table Tennis, Handball, Basketball. Leagues: Bundesliga / 2. Bundesliga / 3. Liga / DFB-Pokal (Germany), DEL (ice hockey), BBL (basketball), Champions League.
Markets: Dreiweg/1X2/Siegwette=1x2, Über/Unter/Tore=total, Beide treffen=btts, Doppelte Chance=double_chance, Handicap=handicap, Halbzeit=ht_1x2.
Pass sport, tournament, country and market as separate search_matches filters instead of putting them into the team field. A "Bundesliga" without sport means German soccer.
Summarise clearly and briefly: key numbers first, then a compact markdown table of relevant matches (match, league, start in local time Europe/Berlin, status, odds yes/no).
For each listed match add a link in the form [Details](/monitoring/match/<id>). If nothing is found, say so and suggest a broader search.`;

const hint = (question: string) => {
  const r = resolveGerman(question);
  const parts = [r.sport && `sport=${r.sport}`, r.tournament && `tournament=${r.tournament}`, r.country && `country=${r.country}`, r.market && `market=${r.market}`].filter(Boolean);
  return parts.length ? `\nDetected in the latest question (use as search_matches filters unless the user says otherwise): ${parts.join(", ")}.` : "";
};

const norm = (s: unknown) => (typeof s === "string" && s.trim() ? s.trim().toLowerCase() : null);

/** Run the fixed German question set and measure whether the model picks the right sport/league/market filters. */
async function runEval(uc: SupabaseClient, sb: SupabaseClient, me: string, apiKey: string, req: Request) {
  const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(req));
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });
  const ts = tools(uc);
  const one = async (c: (typeof EVAL_SET)[number]) => {
    const r = resolveGerman(c.q);
    const resolverOk = r.sport === c.sport && (c.tournament === undefined || r.tournament === c.tournament) && (c.market === undefined || r.market === c.market);
    try {
      const result = streamText({
        model: provider.responses(MODEL),
        system: SYSTEM + hint(c.q),
        prompt: c.q,
        tools: { search_matches: ts.search_matches },
        toolChoice: { type: "tool", toolName: "search_matches" },
        stopWhen: stepCountIs(1),
        abortSignal: req.signal,
        providerOptions: { openai: { forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", store: false, include: ["reasoning.encrypted_content"] } },
      });
      const calls = await result.toolCalls;
      const args = (calls[0]?.input ?? {}) as Record<string, unknown>;
      const sportOk = norm(args.sport) ? sportName(String(args.sport)).toLowerCase() === norm(c.sport) : c.sport === null;
      const tourOk = c.tournament === undefined || (norm(args.tournament) != null && leagueName(String(args.tournament)).name.toLowerCase() === norm(c.tournament));
      const marketOk = c.market === undefined || (norm(args.market) != null && marketKey(String(args.market)) === c.market);
      return { q: c.q, ok: sportOk && tourOk && marketOk, resolverOk, args };
    } catch (e) {
      return { q: c.q, ok: false, resolverOk, error: String((e as Error).message).slice(0, 200) };
    }
  };
  const details: Awaited<ReturnType<typeof one>>[] = [];
  for (let i = 0; i < EVAL_SET.length; i += 4) details.push(...(await Promise.all(EVAL_SET.slice(i, i + 4).map(one))));
  const correct = details.filter((d) => d.ok).length;
  const resolver = details.filter((d) => d.resolverOk).length;
  const row = {
    user_id: me, total: details.length, correct,
    accuracy: Math.round((1000 * correct) / details.length) / 10,
    resolver_accuracy: Math.round((1000 * resolver) / details.length) / 10,
    details,
  };
  const { error } = await sb.from("ai_eval_runs").insert(row);
  if (error) console.error("eval persist", error.message);
  return row;
}

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
    if (body?.eval === true) {
      const [{ data: a }, { data: s }] = await Promise.all([
        sb.rpc("has_role", { _user_id: me, _role: "admin" }),
        sb.rpc("has_role", { _user_id: me, _role: "super_admin" }),
      ]);
      if (!a && !s) return json({ error: "Forbidden" }, 403);
      const key = Deno.env.get("LOVABLE_API_KEY");
      if (!key) return json({ error: "KI nicht konfiguriert" }, 500);
      return json(await runEval(uc, sb, me, key, req));
    }
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
      system: SYSTEM + hint(text),
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
