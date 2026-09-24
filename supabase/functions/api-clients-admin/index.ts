import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { db, sha256 } from "../_shared/feed.ts";

const Id = z.string().uuid();
const ClientFields = z.object({
  name: z.string().trim().min(1).max(100),
  active: z.boolean(),
  sport_ids: z.array(z.string().max(64)).max(200),
  tournament_ids: z.array(z.string().max(64)).max(1000),
  markup_pct: z.number().min(0).max(50),
  rate_limit_per_min: z.number().int().min(1).max(10000),
  allowed_domains: z.array(z.string().trim().min(1).max(253)).max(50),
  formats: z.array(z.enum(["json", "xml"])).min(1),
});
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list") }),
  z.object({ action: z.literal("save"), id: Id.optional(), client: ClientFields }),
  z.object({ action: z.literal("delete"), id: Id }),
  z.object({ action: z.literal("create_key"), client_id: Id, kind: z.enum(["server", "widget"]) }),
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
    if (!isAdmin) return json({ error: "Forbidden" }, 403);

    const p = Body.safeParse(await req.json());
    if (!p.success) return json({ error: p.error.flatten().fieldErrors }, 400);
    const b = p.data;
    const audit = (action: string, id: string, details: Record<string, unknown> = {}) =>
      sb.from("audit_log").insert({ user_id: me, action, entity: "api_client", entity_id: id, details });

    switch (b.action) {
      case "list": {
        const since = new Date(Date.now() - 86400000).toISOString();
        const [c, k, u] = await Promise.all([
          sb.from("api_clients").select("*").order("created_at"),
          sb.from("api_keys").select("id,client_id,kind,prefix,active,last_used_at,created_at").order("created_at"),
          sb.from("api_usage").select("client_id,count").gte("minute", since),
        ]);
        const usage: Record<string, number> = {};
        for (const r of u.data ?? []) usage[r.client_id] = (usage[r.client_id] ?? 0) + r.count;
        return json({
          clients: (c.data ?? []).map((x) => ({
            ...x,
            keys: (k.data ?? []).filter((y) => y.client_id === x.id),
            calls_24h: usage[x.id] ?? 0,
          })),
        });
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
        const key = `${b.kind === "widget" ? "fpw" : "fpk"}_live_${randomKey()}`;
        const { data, error } = await sb
          .from("api_keys")
          .insert({ client_id: b.client_id, kind: b.kind, prefix: key.slice(0, 14), key_hash: await sha256(key) })
          .select("id")
          .single();
        if (error) return json({ error: error.message }, 400);
        await audit("api_key.create", b.client_id, { key_id: data.id, kind: b.kind });
        return json({ id: data.id, key });
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
