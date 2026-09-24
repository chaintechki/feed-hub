// Pulls sport tree, schedule (today + 2 days, live) and market descriptions from the feed API.
// Callable by admins (panel button) or by the feed worker (signed request).
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

import { db } from "../_shared/feed.ts";
import { originAllowed } from "../_shared/guard.ts";
import { upsertEvents, uofGet, verifySigned } from "../_shared/uof.ts";

const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function isAdmin(req: Request) {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  const uc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data } = await uc.auth.getClaims(auth.slice(7));
  const sub = data?.claims?.sub;
  if (!sub) return false;
  const { data: ok } = await db().rpc("has_role", { _user_id: sub, _role: "admin" });
  return !!ok;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!originAllowed(req)) return json({ error: "Forbidden origin" }, 403);
  const body = await req.text();
  const signed = req.headers.has("x-uof-sig") && (await verifySigned(req, body));
  if (!signed && !(await isAdmin(req))) return json({ error: "Unauthorized" }, 401);

  const sb = db();
  const started = Date.now();
  const result: Record<string, any> = {};
  try {
    const sp = await uofGet("/sports/en/sports.xml");
    const sports = (sp?.sports?.sport ?? []).map((s: any, i: number) => ({ id: s.id, name: s.name, sort_order: i }));
    await sb.from("sports").upsert(sports, { onConflict: "id" });
    result.sports = sports.length;

    // The upstream schedule is slow: page through it (100 per page) within a time budget.
    // The caller passes `start`; the response returns `next` (null = reached 3 days ahead).
    const opts = JSON.parse(body || "{}");
    let start = Math.max(0, Number(opts.start) || 0);
    const horizon = Date.now() + 3 * 86_400_000;
    const events: any[] = [];
    let next: number | null = start;
    while (Date.now() - started < 90_000) {
      let x: any = null;
      for (let a = 0; a < 3 && !x; a++) x = await uofGet(`/sports/en/schedules/pre/schedule.xml?start=${start}&limit=100`).catch(() => null);
      if (!x) break;
      const page = x?.schedule?.sport_event ?? [];
      events.push(...page);
      const last = page.at(-1)?.scheduled;
      if (page.length < 100 || (last && Date.parse(last) > horizon)) { next = null; break; }
      start += 100;
      next = start;
    }
    result.schedule = await upsertEvents(sb, events);
    result.next = next;

    const full = opts.markets === true;
    const { count } = await sb.from("uof_markets").select("id", { count: "exact", head: true });
    if (full || !count) {
      const md = await uofGet("/descriptions/en/markets.xml");
      const rows = (md?.market_descriptions?.market ?? []).map((m: any) => ({
        id: Number(m.id), variant: m.variant ?? "", name: m.name,
        outcomes: (m.outcomes?.outcome ?? []).map((o: any) => ({ id: String(o.id), name: o.name })),
        specifiers: (m.specifiers?.specifier ?? []).map((s: any) => s.name).join("|") || null,
      }));
      for (let i = 0; i < rows.length; i += 500) await sb.from("uof_markets").upsert(rows.slice(i, i + 500), { onConflict: "id,variant" });
      result.markets = rows.length;
    }
    result.ms = Date.now() - started;
    await sb.from("uof_sync_runs").insert({ kind: "sync", ok: true, details: result });
    await sb.from("uof_sync_runs").delete().lt("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString());
    return json({ ok: true, ...result });
  } catch (e) {
    console.error(e);
    await sb.from("uof_sync_runs").insert({ kind: "sync", ok: false, details: { error: String((e as Error).message) } });
    return json({ ok: false, error: "sync_failed" }, 502);
  }
});
