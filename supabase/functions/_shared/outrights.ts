// Outright (long-term) markets from the provider feed: season/tournament events instead of matches.
// deno-lint-ignore-file no-explicit-any
import { uofGet } from "./uof.ts";

export const isOutrightEvent = (ev?: string) => !!ev && /^sr:(season|simple_tournament|stage|tournament):/.test(ev);
const arr = (v: any) => (Array.isArray(v) ? v : v ? [v] : []);

type Meta = { tournament_id: string; title: string; names: Map<string, string> };
const metaCache = new Map<string, Meta>();

async function loadMeta(sb: any, ev: string): Promise<Meta | null> {
  const x = await uofGet(`/sports/en/tournaments/${encodeURIComponent(ev)}/info.xml`);
  const ti = x?.tournament_info;
  const t = arr(ti?.tournament)[0];
  const s = arr(t?.sport)[0], c = arr(t?.category)[0];
  if (!t?.id || !s?.id || !c?.id) return null;
  await sb.from("sports").upsert({ id: s.id, name: s.name }, { onConflict: "id", ignoreDuplicates: true });
  await sb.from("categories").upsert({ id: c.id, sport_id: s.id, name: c.name, country_code: c.country_code ?? null }, { onConflict: "id" });
  await sb.from("tournaments").upsert({ id: t.id, category_id: c.id, sport_id: s.id, name: t.name }, { onConflict: "id" });
  const names = new Map<string, string>();
  for (const g of arr(ti?.groups?.group)) for (const cp of arr(g?.competitor)) names.set(cp.id, cp.name);
  for (const cp of arr(ti?.competitors?.competitor)) names.set(cp.id, cp.name);
  const season = arr(ti?.season)[0];
  return { tournament_id: t.id, title: season?.name ?? t.name, names };
}

/** Write outright odds_change / bet_stop messages. Errors are pushed, never thrown. */
export async function writeOutrights(sb: any, msgs: { ev: string; mm: any }[], stops: Set<string>, errors: any[]) {
  if (!msgs.length && !stops.size) return 0;
  const evs = [...new Set(msgs.map((m) => m.ev))];
  // Reuse names from existing rows before calling the provider.
  const missing = evs.filter((e) => !metaCache.has(e));
  if (missing.length) {
    const { data } = await sb.from("outrights").select("event_id,tournament_id,name,competitors").in("event_id", missing).limit(1000);
    for (const r of data ?? []) {
      if (metaCache.has(r.event_id)) continue;
      const names = new Map<string, string>();
      for (const c of r.competitors ?? []) if (c.id && c.name) names.set(c.id, c.name);
      metaCache.set(r.event_id, { tournament_id: r.tournament_id, title: String(r.name).split(" – ")[0], names });
    }
  }
  for (const ev of evs.filter((e) => !metaCache.has(e)).slice(0, 10)) {
    try {
      const m = await loadMeta(sb, ev);
      if (m) metaCache.set(ev, m);
    } catch (e) { errors.push({ kind: "outright_info", event_id: ev, error: String(e) }); }
  }
  const mids = [...new Set(msgs.flatMap((m) => arr(m.mm.odds?.market).map((k: any) => Number(k.id))))].filter(Boolean);
  const mnames = new Map<number, string>();
  if (mids.length) {
    const { data } = await sb.from("uof_markets").select("id,name,name_de").eq("variant", "").in("id", mids);
    for (const r of data ?? []) mnames.set(r.id, r.name_de || r.name);
  }
  const rows = new Map<string, any>();
  const partial: { id: string; suspended: boolean }[] = [];
  const now = new Date().toISOString();
  for (const { ev, mm } of msgs) {
    const meta = metaCache.get(ev);
    if (!meta) continue;
    for (const mk of arr(mm.odds?.market)) {
      const id = `${ev}|${mk.id}|${mk.specifiers ?? ""}`;
      const suspended = String(mk.status) !== "1";
      const outs = arr(mk.outcome).filter((o: any) => o.odds !== undefined);
      if (!outs.length) { partial.push({ id, suspended }); continue; }
      const market = mnames.get(Number(mk.id)) ?? `Markt ${mk.id}`;
      const competitors = outs
        .map((o: any) => ({ id: String(o.id), name: meta.names.get(String(o.id)) ?? String(o.id), odds: o.active === "0" ? null : Number(o.odds) }))
        .sort((a: any, b: any) => (a.odds ?? 1e9) - (b.odds ?? 1e9));
      rows.set(id, {
        id, event_id: ev, market_id: Number(mk.id), market_name: market, tournament_id: meta.tournament_id,
        name: `${meta.title} – ${market}`, status: suspended ? "suspended" : "open", competitors, suspended, custom: false, updated_at: now,
      });
    }
  }
  const list = [...rows.values()];
  for (let i = 0; i < list.length; i += 200) {
    const { error } = await sb.from("outrights").upsert(list.slice(i, i + 200), { onConflict: "id" });
    if (error) errors.push({ kind: "outrights", error: error.message });
  }
  for (const s of [true, false]) {
    const ids = partial.filter((p) => p.suspended === s).map((p) => p.id);
    if (ids.length) await sb.from("outrights").update({ suspended: s, status: s ? "suspended" : "open" }).in("id", ids);
  }
  if (stops.size) await sb.from("outrights").update({ suspended: true, status: "suspended" }).eq("custom", false).in("event_id", [...stops]);
  return list.length;
}
