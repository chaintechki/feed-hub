import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";

import { originAllowed, overUserLimit, passwordLeaked } from "../_shared/guard.ts";
import { USERNAME_DOMAIN, USERNAME_RE, passwordValid, pepperPassword } from "../_shared/auth-core.ts";

const DOMAIN = USERNAME_DOMAIN;
const Password = z.string().max(128).refine(passwordValid, "weak_password");
const Role = z.enum(["super_admin", "admin", "trader", "viewer"]);
const Id = z.string().uuid();
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list") }),
  z.object({
    action: z.literal("create"),
    username: z.string().regex(USERNAME_RE),
    password: Password,
    role: Role,
  }),
  z.object({ action: z.literal("set_role"), user_id: Id, role: Role }),
  z.object({ action: z.literal("reset_password"), user_id: Id, password: Password }),
  z.object({ action: z.literal("check_username"), username: z.string().max(64) }),
  z.object({ action: z.literal("ban"), user_id: Id }),
  z.object({ action: z.literal("unban"), user_id: Id }),
  z.object({ action: z.literal("delete"), user_id: Id }),
]);

const PEPPER = Deno.env.get("PASSWORD_PEPPER")!;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!originAllowed(req)) return json({ error: "Forbidden origin" }, 403);
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: claims, error: cErr } = await userClient.auth.getClaims(auth.slice(7));
    if (cErr || !claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);
    const me = claims.claims.sub as string;

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: me, _role: "admin" });
    if (!isAdmin) return json({ error: "Forbidden" }, 403);

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
    const b = parsed.data;

    if (b.action !== "list" && b.action !== "check_username" && (await overUserLimit(admin, me, "admin-users", 30)))
      return json({ error: "rate_limited" }, 429);
    if ((b.action === "create" || b.action === "reset_password") && (await passwordLeaked(b.password)))
      return json({ error: "password_leaked" }, 400);

    if ("user_id" in b && b.user_id === me && ["ban", "delete"].includes(b.action))
      return json({ error: "You cannot do this to your own account" }, 400);
    const { data: isSuper } = await admin.rpc("has_role", { _user_id: me, _role: "super_admin" });
    const targetIsSuper = async (id: string) =>
      !!(await admin.rpc("has_role", { _user_id: id, _role: "super_admin" })).data;
    if (!isSuper) {
      if ((b.action === "create" || b.action === "set_role") && b.role === "super_admin")
        return json({ error: "forbidden" }, 403);
      if ("user_id" in b && (await targetIsSuper(b.user_id))) return json({ error: "forbidden" }, 403);
    }
    if (b.action === "set_role" && b.user_id === me && !(isSuper ? b.role === "super_admin" : b.role === "admin"))
      return json({ error: "You cannot remove your own admin role" }, 400);
    const rolesFor = (id: string, role: string) =>
      role === "super_admin" ? [{ user_id: id, role: "super_admin" }, { user_id: id, role: "admin" }] : [{ user_id: id, role }];

    const audit = (action: string, id: string, details: Record<string, unknown> = {}) =>
      admin.from("audit_log").insert({ user_id: me, action, entity: "user", entity_id: id, details });

    switch (b.action) {
      case "check_username": {
        const u = b.username.trim().toLowerCase();
        if (!USERNAME_RE.test(u)) return json({ valid: false, available: false });
        const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
        if (error) throw error;
        const taken = data.users.some(
          (x) => x.email?.toLowerCase() === `${u}@${DOMAIN}` || (x.user_metadata?.username as string) === u,
        );
        return json({ valid: true, available: !taken });
      }
      case "list": {
        const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
        if (error) throw error;
        const { data: roles } = await admin.from("user_roles").select("user_id,role");
        const superIds = new Set(
          (roles ?? []).filter((r) => r.role === "super_admin").map((r) => r.user_id),
        );
        const users = data.users
          .filter((u) => isSuper || !superIds.has(u.id))
          .map((u) => ({
            id: u.id,
            username: (u.user_metadata?.username as string) ?? u.email?.split("@")[0] ?? "",
            role: roles?.find((r) => r.user_id === u.id && r.role === "super_admin")?.role
              ?? roles?.find((r) => r.user_id === u.id)?.role ?? "viewer",
            banned: !!u.banned_until && new Date(u.banned_until) > new Date(),
            created_at: u.created_at,
            last_sign_in_at: u.last_sign_in_at ?? null,
          }));
        return json({ users });
      }
      case "create": {
        const { data, error } = await admin.auth.admin.createUser({
          email: `${b.username}@${DOMAIN}`,
          password: await pepperPassword(PEPPER, b.username, b.password),
          email_confirm: true,
          user_metadata: { username: b.username },
        });
        if (error) return json({ error: error.message }, 400);
        const id = data.user.id;
        await admin.from("user_roles").delete().eq("user_id", id);
        await admin.from("user_roles").insert(rolesFor(id, b.role));
        await audit("user.create", id, { username: b.username, role: b.role });
        return json({ id });
      }
      case "set_role": {
        await admin.from("user_roles").delete().eq("user_id", b.user_id);
        const { error } = await admin.from("user_roles").insert(rolesFor(b.user_id, b.role));
        if (error) throw error;
        await audit("user.set_role", b.user_id, { role: b.role });
        return json({ ok: true });
      }
      case "reset_password": {
        const { data: target, error: gErr } = await admin.auth.admin.getUserById(b.user_id);
        if (gErr || !target.user) return json({ error: "User not found" }, 404);
        const uname = (target.user.user_metadata?.username as string) ?? target.user.email!.split("@")[0];
        const { error } = await admin.auth.admin.updateUserById(b.user_id, {
          password: await pepperPassword(PEPPER, uname, b.password),
        });
        if (error) return json({ error: error.message }, 400);
        await audit("user.reset_password", b.user_id);
        return json({ ok: true });
      }
      case "ban":
      case "unban": {
        const { error } = await admin.auth.admin.updateUserById(b.user_id, {
          ban_duration: b.action === "ban" ? "876000h" : "none",
        });
        if (error) return json({ error: error.message }, 400);
        await audit(`user.${b.action}`, b.user_id);
        return json({ ok: true });
      }
      case "delete": {
        await admin.from("api_client_exclusions").delete().eq("admin_id", b.user_id);
        await admin.from("api_clients").update({ owner_id: null }).eq("owner_id", b.user_id);
        await admin.from("user_roles").delete().eq("user_id", b.user_id);
        await admin.from("user_settings").delete().eq("user_id", b.user_id);
        await admin.from("filter_presets").delete().eq("user_id", b.user_id);
        await admin.from("profiles").delete().eq("id", b.user_id);
        const { error } = await admin.auth.admin.deleteUser(b.user_id);
        if (error) return json({ error: error.message }, 400);
        await audit("user.delete", b.user_id);
        return json({ ok: true });
      }
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Server error" }, 500);
  }
});
