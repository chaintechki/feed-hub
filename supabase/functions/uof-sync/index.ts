// Pulls sport tree, schedule (today + 2 days, live) and market descriptions from the feed API.
// Callable by admins (panel button) or by the feed worker (signed request).
// deno-lint-ignore-file no-explicit-any
import { groupOf } from "../_shared/markets.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

import { db } from "../_shared/feed.ts";
import { originAllowed } from "../_shared/guard.ts";
import { upsertEvents, uofGet, verifySigned } from "../_shared/uof.ts";
import { CHECK_AFTER_MS, decideStatus, FINAL, normStatus, OPEN } from "../_shared/status.ts";

const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);

/** Check past open matches with the provider, close finished ones, then record DB size and server memory. */
async function reconcile(sb: any, mem: any) {
  const t0 = Date.now();
  const now = Date.now();
  const stats = { checked: 0, updated: 0, forced: 0, errors: 0 };
  const changes: Record<string, number> = {};
  let ok = true, error: string | null = null;
  try {
    const { data: rows, error: qe } = await sb.from("matches").select("id,status,scheduled")
      .in("status", OPEN).lt("scheduled", new Date(now - CHECK_AFTER_MS).toISOString())
      .order("scheduled").limit(1500);
    if (qe) throw new Error(qe.message);
    const list = rows ?? [];
    const finals: string[] = [];
    const byStatus = new Map<string, { ids: string[]; forced: boolean }>();
    for (let i = 0; i < list.length && Date.now() - t0 < 90_000; i += 10) {
      await Promise.all(list.slice(i, i + 10).map(async (m: any) => {
        let provider: string | null = null;
        try {
          const x = await uofGet(`/sports/en/sport_events/${encodeURIComponent(m.id)}/summary.xml`);
          provider = normStatus(x?.match_summary?.sport_event_status?.status);
        } catch { stats.errors++; }
        stats.checked++;
        const d = decideStatus(m.status, m.scheduled, provider, now);
        if (!d) return;
        const k = `${d.status}|${d.forced}`;
        const g = byStatus.get(k) ?? { ids: [], forced: d.forced };
        g.ids.push(m.id);
        byStatus.set(k, g);
        if (FINAL.has(d.status)) finals.push(m.id);
      }));
    }
    for (const [k, g] of byStatus) {
      const status = k.split("|")[0];
      for (let i = 0; i < g.ids.length; i += 150) {
        const upd: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
        if (FINAL.has(status)) upd.match_minute = null;
        const { error: ue } = await sb.from("matches").update(upd).in("id", g.ids.slice(i, i + 150));
        if (ue) throw new Error(ue.message);
      }
      stats.updated += g.ids.length;
      if (g.forced) stats.forced += g.ids.length;
      changes[status] = (changes[status] ?? 0) + g.ids.length;
    }
    for (let i = 0; i < finals.length; i += 150) {
      await sb.from("match_odds").update({ suspended: true }).eq("suspended", false).in("match_id", finals.slice(i, i + 150));
    }
  } catch (e) {
    ok = false;
    error = String((e as Error).message);
  }
  const duration_ms = Date.now() - t0;
  await sb.from("status_sync_runs").insert({ ok, ...stats, duration_ms, details: { changes, error } });
  // Measurement must never break the reconcile.
  const { error: me } = await sb.rpc("ops_snapshot_ext", {
    _kind: "status", _rss: num(mem?.rss), _heap: num(mem?.heap), _total: num(mem?.total), _free: num(mem?.free),
  });
  if (me) console.error("ops_snapshot_ext", me.message);
  return { ok, ...stats, changes, duration_ms, error };
}

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
  let parsedOpts: any = {};
  try { parsedOpts = JSON.parse(body || "{}"); } catch { /* ignore */ }
  if (parsedOpts.status === true) {
    const r = await reconcile(sb, parsedOpts.mem);
    return json(r, r.ok ? 200 : 502);
  }
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
    while (Date.now() - started < 70_000) {
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
    const { data: newest } = await sb.from("uof_markets").select("updated_at,name_de").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    const stale = !newest || !newest.name_de || Date.now() - Date.parse(newest.updated_at) > 86_400_000;
    if (full || stale) {
      const load = async (lang: string) => {
        const md = await uofGet(`/descriptions/${lang}/markets.xml`);
        return (md?.market_descriptions?.market ?? []) as any[];
      };
      const [en, de] = await Promise.all([load("en"), load("de").catch(() => [] as any[])]);
      const outs = (m: any) => (m?.outcomes?.outcome ?? []).map((o: any) => ({ id: String(o.id), name: o.name }));
      const deMap = new Map(de.map((m) => [`${m.id}|${m.variant ?? ""}`, m]));
      const now = new Date().toISOString();
      const rows = en.map((m: any) => {
        const d = deMap.get(`${m.id}|${m.variant ?? ""}`);
        return {
          id: Number(m.id), variant: m.variant ?? "", name: m.name,
          name_de: d?.name ?? null, outcomes: outs(m), outcomes_de: d ? outs(d) : null,
          specifiers: (m.specifiers?.specifier ?? []).map((s: any) => s.name).join("|") || null,
          market_group: groupOf(String(m.name ?? "")), updated_at: now,
        };
      });
      const uniq = [...new Map(rows.map((r: any) => [`${r.id}|${r.variant}`, r])).values()];
      for (let i = 0; i < uniq.length; i += 500) { const { error } = await sb.from("uof_markets").upsert(uniq.slice(i, i + 500), { onConflict: "id,variant" }); if (error) throw new Error(`markets: ${error.message}`); }
      result.markets = uniq.length;
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
