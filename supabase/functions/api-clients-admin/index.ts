import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { db, sha256 } from "../_shared/feed.ts";
import { isValidIpRule } from "../_shared/api-core.ts";
import { originAllowed, overUserLimit } from "../_shared/guard.ts";

const Id = z.string().uuid();
const ClientFields = z.object({
  name: z.string().trim().min(1).max(100),
  active: z.boolean(),
  sport_ids: z.array(z.string().max(64)).max(200),
  tournament_ids: z.array(z.string().max(64)).max(1000),
  markup_pct: z.number().min(-50).max(50),
  rate_limit_per_min: z.number().int().min(1).max(10000),
  allowed_domains: z.array(z.string().trim().min(1).max(253)).max(50),
  formats: z.array(z.enum(["json", "xml"])).min(1),
  market_groups: z.array(z.enum(["main", "goals", "half", "periods", "corners", "cards", "players", "other"])).max(8).default([]),
});
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list") }),
  z.object({ action: z.literal("save"), id: Id.optional(), client: ClientFields }),
  z.object({ action: z.literal("delete"), id: Id }),
  z.object({ action: z.literal("assign"), id: Id, owner_id: Id.nullable() }),
  z.object({ action: z.literal("users") }),
  z.object({ action: z.literal("set_exclusions"), id: Id, admin_ids: z.array(Id).max(500) }),
  z.object({
    action: z.literal("create_key"),
    client_id: Id,
    kind: z.enum(["server", "widget"]),
    label: z.string().trim().max(60).default(""),
    expires_at: z.string().datetime().nullable().default(null),
    allowed_ips: z.array(z.string().trim().max(64).refine(isValidIpRule, "invalid IP/CIDR")).max(50).default([]),
  }),
  z.object({ action: z.literal("rotate_key"), key_id: Id, grace_hours: z.number().int().min(0).max(168).default(24) }),
  z.object({ action: z.literal("toggle_key"), key_id: Id, active: z.boolean() }),
  z.object({ action: z.literal("delete_key"), key_id: Id }),
]);

const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function randomKey() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!originAllowed(req)) return json({ error: "Forbidden origin" }, 403);
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const uc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: cl, error: ce } = await uc.auth.getClaims(auth.slice(7));
    if (ce || !cl?.claims?.sub) return json({ error: "Unauthorized" }, 401);
    const me = cl.claims.sub as string;
    const sb = db();
    const { data: isAdmin } = await sb.rpc("has_role", { _user_id: me, _role: "admin" });

    const p = Body.safeParse(await req.json());
    if (!p.success) return json({ error: p.error.flatten().fieldErrors }, 400);
    const forbidden = () => json({ error: "Forbidden" }, 403);
    const { data: isSuper } = await sb.rpc("has_role", { _user_id: me, _role: "super_admin" });
    const ownsClient = async (id: string) =>
      !!(await sb.rpc("can_see_api_client", { _user: me, _client: id })).data;
    const ownsKey = async (keyId: string) => {
      const { data } = await sb.from("api_keys").select("client_id").eq("id", keyId).maybeSingle();
      return !!data && (await ownsClient(data.client_id));
    };
    const a0 = p.data;
    if (a0.action === "set_exclusions" && !isSuper) return forbidden();
    if (!isAdmin && ["delete", "assign", "users"].includes(a0.action)) return forbidden();
    if (!isAdmin && a0.action === "save" && !a0.id) return forbidden();
    {
      if ((a0.action === "delete" || a0.action === "assign") && !(await ownsClient(a0.id))) return forbidden();
      if (a0.action === "save" && a0.id && !(await ownsClient(a0.id))) return forbidden();
      if (a0.action === "create_key" && !(await ownsClient(a0.client_id))) return forbidden();
      if ((a0.action === "rotate_key" || a0.action === "toggle_key" || a0.action === "delete_key") && !(await ownsKey(a0.key_id)))
        return forbidden();
    }
    if (p.data.action !== "list" && (await overUserLimit(sb, me, "api-clients-admin", 30)))
      return json({ error: "rate_limited" }, 429);
    const b = p.data;
    const audit = (action: string, id: string, details: Record<string, unknown> = {}) =>
      sb.from("audit_log").insert({ user_id: me, action, entity: "api_client", entity_id: id, details });

    switch (b.action) {
      case "list": {
        const since = new Date(Date.now() - 86400000).toISOString();
        const [c0, k, u, pr, ex] = await Promise.all([
          sb.from("api_clients").select("*").order("created_at"),
          sb.from("api_keys").select("id,client_id,kind,prefix,active,last_used_at,created_at,expires_at,allowed_ips,label,rotated_from").order("created_at"),
          sb.from("api_usage").select("client_id,count").gte("minute", since),
          sb.from("profiles").select("id,username"),
          sb.from("api_client_exclusions").select("client_id,admin_id"),
        ]);
        const exRows = ex.data ?? [];
        const c = {
          data: (c0.data ?? []).filter((x) =>
            isSuper ? true
            : isAdmin ? !exRows.some((e) => e.client_id === x.id && e.admin_id === me)
            : x.owner_id === me),
        };
        const names: Record<string, string> = {};
        for (const r of pr.data ?? []) names[r.id] = r.username ?? "";
        const usage: Record<string, number> = {};
        for (const r of u.data ?? []) usage[r.client_id] = (usage[r.client_id] ?? 0) + r.count;
        return json({
          clients: (c.data ?? []).map((x) => ({
            ...x,
            keys: (k.data ?? []).filter((y) => y.client_id === x.id),
            calls_24h: usage[x.id] ?? 0,
            owner_name: x.owner_id ? names[x.owner_id] ?? null : null,
            ...(isSuper ? { excluded_admins: exRows.filter((e) => e.client_id === x.id).map((e) => e.admin_id) } : {}),
          })),
          is_admin: !!isAdmin,
          is_super: !!isSuper,
        });
      }
      case "users": {
        const [{ data }, { data: rr }] = await Promise.all([
          sb.from("profiles").select("id,username").order("username"),
          sb.from("user_roles").select("user_id,role"),
        ]);
        return json({
          users: (data ?? []).map((u) => {
            const rs = (rr ?? []).filter((x) => x.user_id === u.id).map((x) => x.role);
            return { ...u, role: rs.includes("super_admin") ? "super_admin" : rs[0] ?? "viewer" };
          }),
        });
      }
      case "set_exclusions": {
        const { data: admins } = await sb.from("user_roles").select("user_id").eq("role", "admin").in("user_id", b.admin_ids.length ? b.admin_ids : ["00000000-0000-0000-0000-000000000000"]);
        const { data: supers } = await sb.from("user_roles").select("user_id").eq("role", "super_admin");
        const superIds = new Set((supers ?? []).map((x) => x.user_id));
        const ids = (admins ?? []).map((x) => x.user_id).filter((x) => !superIds.has(x));
        await sb.from("api_client_exclusions").delete().eq("client_id", b.id);
        if (ids.length) {
          const { error } = await sb.from("api_client_exclusions").insert(ids.map((admin_id) => ({ client_id: b.id, admin_id })));
          if (error) return json({ error: error.message }, 400);
        }
        await audit("api_client.exclusions", b.id, { admin_ids: ids });
        return json({ ok: true });
      }
      case "assign": {
        if (b.owner_id) {
          const { data: u } = await sb.from("profiles").select("id").eq("id", b.owner_id).maybeSingle();
          if (!u) return json({ error: "User not found" }, 404);
        }
        const { error } = await sb.from("api_clients").update({ owner_id: b.owner_id }).eq("id", b.id);
        if (error) return json({ error: error.message }, 400);
        await audit("api_client.assign", b.id, { owner_id: b.owner_id });
        return json({ ok: true });
      }
      case "save": {
        const q = b.id
          ? sb.from("api_clients").update(b.client).eq("id", b.id).select("id").single()
          : sb.from("api_clients").insert(b.client).select("id").single();
        const { data, error } = await q;
        if (error) return json({ error: error.message }, 400);
        await audit(b.id ? "api_client.update" : "api_client.create", data.id, { name: b.client.name });
        return json({ id: data.id });
      }
      case "delete": {
        await sb.from("api_clients").delete().eq("id", b.id);
        await audit("api_client.delete", b.id);
        return json({ ok: true });
      }
      case "create_key": {
        if (b.expires_at && new Date(b.expires_at).getTime() <= Date.now()) return json({ error: "expires_at must be in the future" }, 400);
        const key = `${b.kind === "widget" ? "fpw" : "fpk"}_live_${randomKey()}`;
        const { data, error } = await sb
          .from("api_keys")
          .insert({
            client_id: b.client_id,
            kind: b.kind,
            prefix: key.slice(0, 14),
            key_hash: await sha256(key),
            label: b.label,
            expires_at: b.expires_at,
            allowed_ips: b.kind === "server" ? b.allowed_ips : [],
          })
          .select("id")
          .single();
        if (error) return json({ error: error.message }, 400);
        await audit("api_key.create", b.client_id, { key_id: data.id, kind: b.kind, expires_at: b.expires_at, ips: b.allowed_ips.length });
        return json({ id: data.id, key });
      }
      case "rotate_key": {
        const { data: old, error: oe } = await sb.from("api_keys").select("*").eq("id", b.key_id).single();
        if (oe || !old) return json({ error: "Key not found" }, 404);
        const key = `${old.kind === "widget" ? "fpw" : "fpk"}_live_${randomKey()}`;
        const { data, error } = await sb
          .from("api_keys")
          .insert({
            client_id: old.client_id,
            kind: old.kind,
            prefix: key.slice(0, 14),
            key_hash: await sha256(key),
            label: old.label,
            expires_at: old.expires_at && new Date(old.expires_at).getTime() > Date.now() ? old.expires_at : null,
            allowed_ips: old.allowed_ips,
            rotated_from: old.id,
          })
          .select("id")
          .single();
        if (error) return json({ error: error.message }, 400);
        const graceEnd = new Date(Date.now() + b.grace_hours * 3600_000).toISOString();
        const oldEnd = old.expires_at && old.expires_at < graceEnd ? old.expires_at : graceEnd;
        await sb.from("api_keys").update({ expires_at: oldEnd }).eq("id", old.id);
        await audit("api_key.rotate", old.client_id, { old_key: old.id, new_key: data.id, grace_hours: b.grace_hours });
        return json({ id: data.id, key, old_expires_at: oldEnd });
      }
      case "toggle_key": {
        await sb.from("api_keys").update({ active: b.active }).eq("id", b.key_id);
        await audit(b.active ? "api_key.enable" : "api_key.disable", b.key_id);
        return json({ ok: true });
      }
      case "delete_key": {
        await sb.from("api_keys").delete().eq("id", b.key_id);
        await audit("api_key.delete", b.key_id);
        return json({ ok: true });
      }
    }
  } catch (e) {
    console.error(e);
    return json({ error: "Server error" }, 500);
  }
});
