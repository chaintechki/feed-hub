// Receives batched feed messages from the feed worker (HMAC-signed) and writes them to the database.
// deno-lint-ignore-file no-explicit-any
import { db } from "../_shared/feed.ts";
import { eventStatus, fetchFixture, mapMarket, parser, verifySigned } from "../_shared/uof.ts";

const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { "Content-Type": "application/json" } });
const PRODUCERS: Record<number, string> = { 1: "LO", 3: "Ctrl", 4: "BetPal", 5: "PremiumCricket", 6: "VF", 7: "WNS", 8: "VBL", 9: "VTO", 10: "VDR", 11: "VHC", 12: "VTI" };
const ts = (ms: unknown) => new Date(Number(ms) || Date.now()).toISOString();

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const body = await req.text();
  if (body.length > 5_000_000) return json({ error: "Too large" }, 413);
  if (!(await verifySigned(req, body))) return json({ error: "Unauthorized" }, 401);
  let msgs: { xml: string }[] = [];
  try {
    msgs = JSON.parse(body).messages ?? [];
  } catch {
    return json({ error: "Bad body" }, 400);
  }

  const sb = db();
  const known = new Set<string>();
  const unknown = new Set<string>();
  const oddsRows = new Map<string, any>();
  const matchUpd = new Map<string, any>();
  const settle: any[] = [];
  const stops = new Set<string>();
  const producers = new Map<number, any>();
  const errors: any[] = [];

  // Which referenced events exist?
  const parsed = msgs.map((m) => { try { return parser.parse(m.xml); } catch (e) { errors.push({ kind: "parse", error: String(e) }); return null; } });
  const ids = new Set<string>();
  for (const p of parsed) for (const v of Object.values(p ?? {}) as any[]) if (v?.event_id?.startsWith?.("sr:match:")) ids.add(v.event_id);
  const idList = [...ids];
  for (let i = 0; i < idList.length; i += 200) {
    const { data } = await sb.from("matches").select("id").in("id", idList.slice(i, i + 200));
    for (const r of data ?? []) known.add(r.id);
  }
  for (const id of idList) if (!known.has(id)) unknown.add(id);
  // fetch up to 10 unknown fixtures per batch so their odds can land
  for (const id of [...unknown].slice(0, 10)) {
    try { await fetchFixture(sb, id); known.add(id); } catch (e) { errors.push({ kind: "fixture", event_id: id, error: String(e) }); }
  }

  for (const p of parsed) {
    if (!p) continue;
    const [kind, m] = Object.entries(p).find(([k]) => k !== "?xml") ?? [];
    if (!kind || !m) continue;
    const mm = m as any;
    const product = Number(mm.product);
    if (product) {
      const cur = producers.get(product) ?? { id: product, name: PRODUCERS[product] ?? `P${product}` };
      cur.last_message_at = ts(mm.timestamp);
      if (kind === "alive") { cur.last_alive_at = ts(mm.timestamp); cur.down = mm.subscribed === "0"; }
      if (kind === "snapshot_complete") cur.down = false;
      producers.set(product, cur);
    }
    const ev = mm.event_id as string | undefined;
    if (!ev || !known.has(ev)) continue;
    try {
      if (kind === "odds_change") {
        const st = mm.sport_event_status;
        if (st) matchUpd.set(ev, {
          status: eventStatus(st.status),
          match_minute: st.clock?.match_time ? parseInt(st.clock.match_time, 10) || null : null,
          updated_at: new Date().toISOString(),
        });
        for (const mk of mm.odds?.market ?? []) {
          const map = mapMarket(Number(mk.id), mk.specifiers);
          if (!map) continue;
          const outs = (mk.outcome ?? []).filter((o: any) => o.odds !== undefined);
          const outcomes = outs.map((o: any) => ({ label: map.label(String(o.id)), odds: o.active === "0" ? null : Number(o.odds) }));
          const suspended = String(mk.status) !== "1";
          for (const source of ["own", "average"]) {
            oddsRows.set(`${ev}|${source}|${map.market}|${map.specifier ?? ""}`, {
              match_id: ev, source, market: map.market, specifier: map.specifier, market_group: map.group,
              suspended, updated_at: new Date().toISOString(), ...(outcomes.length ? { outcomes } : {}),
            });
          }
        }
      } else if (kind === "bet_stop") {
        stops.add(ev);
      } else if (kind === "bet_settlement" || kind === "bet_cancel") {
        for (const mk of (kind === "bet_settlement" ? mm.outcomes?.market : mm.market) ?? []) {
          const map = mapMarket(Number(mk.id), mk.specifiers);
          if (!map) continue;
          if (kind === "bet_cancel") settle.push({ match_id: ev, market: map.market, specifier: map.specifier, outcome: null, state: "cancelled", settled_at: new Date().toISOString() });
          else for (const o of mk.outcome ?? []) if (String(o.result) === "1")
            settle.push({ match_id: ev, market: map.market, specifier: map.specifier, outcome: map.label(String(o.id)), state: "settled", settled_at: new Date().toISOString() });
        }
      } else if (kind === "fixture_change") {
        await fetchFixture(sb, ev);
      }
    } catch (e) {
      errors.push({ kind, event_id: ev, error: String(e) });
    }
  }

  const rows = [...oddsRows.values()];
  // rows without outcomes only toggle suspension
  const full = rows.filter((r) => r.outcomes), partial = rows.filter((r) => !r.outcomes);
  for (let i = 0; i < full.length; i += 500) {
    const { error } = await sb.from("match_odds").upsert(full.slice(i, i + 500), { onConflict: "match_id,source,market,specifier" });
    if (error) errors.push({ kind: "odds", error: error.message });
  }
  for (const r of partial) await sb.from("match_odds").update({ suspended: r.suspended }).eq("match_id", r.match_id).eq("market", r.market);
  for (const [id, u] of matchUpd) await sb.from("matches").update(u).eq("id", id);
  if (stops.size) await sb.from("match_odds").update({ suspended: true }).in("match_id", [...stops]);
  if (settle.length) await sb.from("settlements").insert(settle);
  if (producers.size) await sb.from("uof_producers").upsert([...producers.values()].map((p) => ({ ...p, updated_at: new Date().toISOString() })), { onConflict: "id" });
  if (errors.length) await sb.from("uof_messages_log").insert(errors.slice(0, 50).map((e) => ({ kind: e.kind, event_id: e.event_id ?? null, error: e.error.slice(0, 500) })));

  return json({ ok: true, messages: msgs.length, odds: rows.length, skipped_unknown: unknown.size, errors: errors.length });
});
