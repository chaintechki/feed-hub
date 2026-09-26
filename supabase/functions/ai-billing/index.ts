// AI query billing: quota summary, USDT orders, on-chain verification, super-admin overview.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { db } from "../_shared/feed.ts";
import { originAllowed, overUserLimit } from "../_shared/guard.ts";
import { decide, fetchFacts, NETWORKS, USDT, validTxHash, type Network } from "../_shared/chain-verify.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const env = () => ({ etherscan: Deno.env.get("ETHERSCAN_API_KEY") ?? undefined, tron: Deno.env.get("TRONGRID_API_KEY") ?? undefined });

type OrderRow = {
  id: string; user_id: string; network: Network; packs: number; credits: number; amount_exact: number | string; address: string;
  status: string; tx_hash: string | null; created_at: string; expires_at: string; reject_reason: string | null; confirmations: number | null;
};

async function settings(sb: SupabaseClient) {
  const { data } = await sb.from("payment_settings").select("*").eq("id", 1).single();
  return data as { free_monthly: number; pack_size: number; pack_price_usdt: number; order_ttl_min: number; confirmations: Record<string, number> };
}

async function summary(sb: SupabaseClient, me: string, isSuper: boolean) {
  const [s, { data: c }, { data: addrs }, { data: orders }] = await Promise.all([
    settings(sb),
    sb.from("ai_credits").select("purchased,free_used,period").eq("user_id", me).maybeSingle(),
    sb.from("payment_addresses").select("network,address").eq("active", true),
    sb.from("payment_orders").select("id,network,packs,credits,amount_exact,address,status,tx_hash,created_at,expires_at,reject_reason,confirmations").eq("user_id", me).order("created_at", { ascending: false }).limit(20),
  ]);
  const period = new Date().toISOString().slice(0, 7) + "-01";
  const used = c && c.period === period ? c.free_used : 0;
  return {
    unlimited: isSuper,
    free_total: s.free_monthly,
    free_left: Math.max(s.free_monthly - used, 0),
    purchased: c?.purchased ?? 0,
    pack_size: s.pack_size,
    pack_price: Number(s.pack_price_usdt),
    ttl_min: s.order_ttl_min,
    networks: (addrs ?? []).map((a) => ({ network: a.network, label: USDT[a.network as Network].label })),
    orders: orders ?? [],
  };
}

/** Re-check one order on chain and persist the result. */
async function check(sb: SupabaseClient, o: OrderRow) {
  if (!o.tx_hash || o.status === "paid") return o;
  const s = await settings(sb);
  const need = Number(s.confirmations?.[o.network] ?? 12);
  let v;
  try {
    const facts = await fetchFacts(o.network, o.tx_hash, env());
    v = decide({ network: o.network, address: o.address, amount: String(o.amount_exact), createdAt: Date.parse(o.created_at), expiresAt: Date.parse(o.expires_at) }, facts, need);
  } catch (e) {
    console.error("verify", o.id, (e as Error).message);
    await sb.from("payment_orders").update({ checked_at: new Date().toISOString() }).eq("id", o.id);
    return { ...o, status: "confirming" };
  }
  if (v.state === "paid") {
    await sb.rpc("ai_credit_order", { _order: o.id, _tx: o.tx_hash, _raw: { received: v.received } });
    return { ...o, status: "paid" };
  }
  if (v.state === "rejected") {
    await sb.from("payment_orders").update({ status: "rejected", reject_reason: v.reason, checked_at: new Date().toISOString() }).eq("id", o.id);
    return { ...o, status: "rejected", reject_reason: v.reason };
  }
  const tooOld = Date.now() - Date.parse(o.created_at) > 24 * 3600_000;
  const patch = v.state === "not_found" && tooOld
    ? { status: "rejected", reject_reason: "tx_not_found" }
    : { status: "confirming", confirmations: v.state === "confirming" ? v.confirmations : 0 };
  await sb.from("payment_orders").update({ ...patch, checked_at: new Date().toISOString() }).eq("id", o.id);
  return { ...o, ...patch };
}

async function sweep(sb: SupabaseClient) {
  await sb.from("payment_orders").update({ status: "expired" }).eq("status", "pending").is("tx_hash", null).lt("expires_at", new Date().toISOString());
  const { data } = await sb.from("payment_orders").select("*").eq("status", "confirming").order("checked_at", { ascending: true, nullsFirst: true }).limit(15);
  let paid = 0;
  for (const o of (data ?? []) as OrderRow[]) if ((await check(sb, o)).status === "paid") paid++;
  return { checked: data?.length ?? 0, paid };
}

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("summary") }),
  z.object({ action: z.literal("sweep") }),
  z.object({ action: z.literal("create_order"), network: z.enum(NETWORKS as [Network, ...Network[]]), packs: z.number().int().min(1).max(10) }),
  z.object({ action: z.literal("submit_tx"), order_id: z.string().uuid(), tx: z.string().trim().min(10).max(80) }),
  z.object({ action: z.literal("status"), order_id: z.string().uuid() }),
  z.object({ action: z.literal("cancel"), order_id: z.string().uuid() }),
  z.object({ action: z.literal("admin_overview") }),
  z.object({ action: z.literal("admin_adjust"), user_id: z.string().uuid(), delta: z.number().int().min(-100000).max(100000), reason: z.string().trim().min(3).max(300) }),
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ error: "Ungültige Anfrage", details: parsed.error.flatten().fieldErrors }, 400);
    const b = parsed.data;
    const sb = db();

    // Scheduler entry: idempotent, only processes already-submitted orders.
    if (b.action === "sweep") return json(await sweep(sb));

    if (!originAllowed(req)) return json({ error: "Forbidden origin" }, 403);
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const uc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: cl, error: ce } = await uc.auth.getClaims(auth.slice(7));
    if (ce || !cl?.claims?.sub) return json({ error: "Unauthorized" }, 401);
    const me = cl.claims.sub as string;
    const { data: isSuper } = await sb.rpc("has_role", { _user_id: me, _role: "super_admin" });
    if (await overUserLimit(sb, me, "ai-billing", 30)) return json({ error: "Zu viele Anfragen – bitte kurz warten." }, 429);

    const own = async (id: string) => {
      const { data } = await sb.from("payment_orders").select("*").eq("id", id).eq("user_id", me).maybeSingle();
      return data as OrderRow | null;
    };

    switch (b.action) {
      case "summary":
        return json(await summary(sb, me, !!isSuper));

      case "create_order": {
        const { data: addr } = await sb.from("payment_addresses").select("address").eq("network", b.network).eq("active", true).maybeSingle();
        if (!addr) return json({ error: "Netzwerk nicht verfügbar" }, 400);
        const { count } = await sb.from("payment_orders").select("id", { count: "exact", head: true }).eq("user_id", me).eq("status", "pending");
        if ((count ?? 0) >= 3) return json({ error: "Zu viele offene Bestellungen – bitte zuerst abschließen oder abbrechen." }, 429);
        const s = await settings(sb);
        const base = b.packs * Number(s.pack_price_usdt);
        for (let i = 0; i < 8; i++) {
          const cents = 1 + Math.floor(Math.random() * 999); // 0.0001 .. 0.0999
          const amount = (base + cents / 10000).toFixed(4);
          const { data, error } = await sb.from("payment_orders").insert({
            user_id: me, network: b.network, packs: b.packs, credits: b.packs * s.pack_size, amount_exact: amount,
            address: addr.address, expires_at: new Date(Date.now() + s.order_ttl_min * 60_000).toISOString(),
          }).select("id,network,packs,credits,amount_exact,address,status,created_at,expires_at").single();
          if (!error) return json({ order: data });
          if (error.code !== "23505") throw error;
        }
        return json({ error: "Bitte erneut versuchen" }, 503);
      }

      case "submit_tx": {
        const o = await own(b.order_id);
        if (!o) return json({ error: "Bestellung nicht gefunden" }, 404);
        if (o.status !== "pending") return json({ error: "Bestellung ist nicht mehr offen" }, 409);
        if (Date.now() > Date.parse(o.expires_at)) return json({ error: "Bestellung abgelaufen" }, 409);
        let tx = b.tx.trim();
        if (!validTxHash(o.network, tx)) return json({ error: "Ungültige Transaktions-ID" }, 400);
        tx = o.network === "tron" ? tx.replace(/^0x/, "").toLowerCase() : tx.toLowerCase();
        const { error } = await sb.from("payment_orders").update({ tx_hash: tx, status: "confirming" }).eq("id", o.id).eq("status", "pending");
        if (error?.code === "23505") return json({ error: "Diese Transaktion wurde bereits verwendet" }, 409);
        if (error) throw error;
        return json({ order: await check(sb, { ...o, tx_hash: tx, status: "confirming" }) });
      }

      case "status": {
        const o = await own(b.order_id);
        if (!o) return json({ error: "Bestellung nicht gefunden" }, 404);
        const recent = o.status === "confirming" ? await check(sb, o) : o;
        return json({ order: recent });
      }

      case "cancel": {
        await sb.from("payment_orders").update({ status: "expired" }).eq("id", b.order_id).eq("user_id", me).eq("status", "pending");
        return json({ ok: true });
      }

      case "admin_overview": {
        if (!isSuper) return json({ error: "Forbidden" }, 403);
        const [{ data: orders }, { data: credits }, { data: profiles }] = await Promise.all([
          sb.from("payment_orders").select("*").order("created_at", { ascending: false }).limit(200),
          sb.from("ai_credits").select("*"),
          sb.from("profiles").select("id,username,display_name"),
        ]);
        return json({ orders, credits, profiles });
      }

      case "admin_adjust": {
        if (!isSuper) return json({ error: "Forbidden" }, 403);
        const { data, error } = await sb.rpc("ai_admin_adjust", { _actor: me, _user: b.user_id, _delta: b.delta, _reason: b.reason });
        if (error) throw error;
        return json({ purchased: data });
      }
    }
  } catch (e) {
    console.error(e);
    return json({ error: "Internal error" }, 500);
  }
});
