// Gateway administration (super admin only): health, login check, queue status/test/password,
// queue connection data and switching the active feed connection.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { db } from "../_shared/feed.ts";
import { originAllowed, overUserLimit } from "../_shared/guard.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const host = () => (Deno.env.get("GW_API_HOST") ?? "admin-uof.oddz.club").replace(/^https?:\/\//, "").replace(/\/$/, "");
const clientId = () => Deno.env.get("GW_FEED_CLIENT_ID") ?? "";
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const credentialsPlaceholder = () => !GUID.test(clientId()) || /dummy|placeholder/i.test(Deno.env.get("GW_USERNAME") ?? "dummy");

let tok: { v: string; exp: number } | null = null;
async function login() {
  if (tok && tok.exp - 60_000 > Date.now()) return tok.v;
  if (credentialsPlaceholder()) throw new Error("credentials_placeholder");
  const r = await fetch(`https://${host()}/v1/client/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ feedClientId: clientId(), username: Deno.env.get("GW_USERNAME"), password: Deno.env.get("GW_PASSWORD") }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error(`login_failed_${r.status}`);
  const d = await r.json();
  tok = { v: d.accessToken, exp: Date.parse(d.expiresAt) || Date.now() + 10 * 60_000 };
  return tok.v;
}
async function gw(method: string, path: string, body?: unknown) {
  const t = await login();
  const r = await fetch(`https://${host()}/v1/client${path}`, {
    method,
    headers: { Authorization: `Bearer ${t}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const text = await r.text();
  let data: any = text;
  try { data = text ? JSON.parse(text) : null; } catch { /* keep text */ }
  return { ok: r.ok, status: r.status, data };
}
async function health() {
  try {
    const r = await fetch(`https://${host()}/health`, { signal: AbortSignal.timeout(8000) });
    return r.ok;
  } catch { return false; }
}
function randomPassword() {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => a[b % a.length]).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!originAllowed(req)) return json({ error: "Forbidden origin" }, 403);
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const uc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: cl, error: ce } = await uc.auth.getClaims(auth.slice(7));
  if (ce || !cl?.claims?.sub) return json({ error: "Unauthorized" }, 401);
  const me = cl.claims.sub as string;
  const sb = db();
  const { data: isSuper } = await sb.rpc("has_role", { _user_id: me, _role: "super_admin" });
  if (!isSuper) return json({ error: "forbidden" }, 403);
  if (await overUserLimit(sb, me, "gateway-admin", 20)) return json({ error: "rate_limited" }, 429);

  let p: any = {};
  try { p = await req.json(); } catch { /* empty */ }
  const setGw = (patch: Record<string, unknown>) => sb.from("feed_connections").update({ ...patch, last_check: new Date().toISOString(), updated_by: me }).eq("id", "gateway");

  try {
    switch (p.action) {
      case "overview": {
        const [{ data: conns }, up] = await Promise.all([sb.from("feed_connections").select("id,active,verified,status,last_check,info").order("id"), health()]);
        const placeholder = credentialsPlaceholder();
        let queue: any = null, loginOk: boolean | null = null, error: string | null = null;
        if (!placeholder) {
          try {
            const q = await gw("GET", `/feed-clients/${clientId()}/rabbitmq/status`);
            loginOk = true;
            queue = q.ok ? q.data : { error: q.status };
          } catch (e) { loginOk = false; error = (e as Error).message; }
        }
        const status = placeholder ? "credentials_placeholder" : !up ? "unreachable" : loginOk === false ? "login_failed" : "reachable";
        await setGw({ status });
        return json({ connections: conns, gateway: { host: host(), healthy: up, placeholder, login: loginOk, queue, error, status } });
      }
      case "test_message": {
        const r = await gw("POST", `/feed-clients/${clientId()}/rabbitmq/test-message`);
        await setGw({ status: r.ok ? "test_ok" : `test_failed_${r.status}`, ...(r.ok ? { verified: true } : {}) });
        return json({ ok: r.ok, status: r.status, result: r.data }, r.ok ? 200 : 502);
      }
      case "rotate_password": {
        const pw = randomPassword();
        const r = await gw("PUT", `/feed-clients/${clientId()}/rabbitmq/password`, { password: pw });
        if (!r.ok) return json({ ok: false, status: r.status }, 502);
        await sb.from("feed_connection_secrets").upsert({ id: "gateway", mq_password: pw, updated_at: new Date().toISOString() });
        return json({ ok: true });
      }
      case "skip_calculation": {
        const r = await gw("PUT", `/feed-clients/${clientId()}/skip-calculation`, { skipCalculation: !!p.value });
        return json({ ok: r.ok, status: r.status }, r.ok ? 200 : 502);
      }
      case "save_queue": {
        const s = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
        const info = { mq_host: s(p.mq_host), mq_port: Math.min(65535, Math.max(1, Number(p.mq_port) || 5671)), mq_vhost: s(p.mq_vhost) || "/", mq_user: s(p.mq_user), mq_exchange: s(p.mq_exchange) || "unifiedfeed" };
        if (info.mq_host && !/^[a-z0-9.-]+$/i.test(info.mq_host)) return json({ error: "invalid_host" }, 400);
        await sb.from("feed_connections").update({ info, updated_by: me }).eq("id", "gateway");
        return json({ ok: true });
      }
      case "activate": {
        if (p.id !== "uof" && p.id !== "gateway") return json({ error: "invalid" }, 400);
        const { data, error } = await uc.rpc("feed_connection_activate", { _id: p.id });
        if (error) return json({ error: error.message }, error.message.includes("not_verified") ? 409 : 400);
        return json(data);
      }
      default:
        return json({ error: "unknown_action" }, 400);
    }
  } catch (e) {
    const msg = (e as Error).message;
    return json({ error: msg }, msg === "credentials_placeholder" ? 409 : 502);
  }
});
