import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";

import {
  USERNAME_DOMAIN,
  USERNAME_RE,
  makeChallenge,
  pepperPassword,
  signChallenge,
  verifyChallenge,
} from "../_shared/auth-core.ts";

const MAX_FAILS: Record<string, number> = { c: 5, ip: 30, u: 20 };
const LOCK_MS = 15 * 60_000;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const Login = z.object({
  username: z.string().trim().toLowerCase().regex(USERNAME_RE),
  password: z.string().min(1).max(128),
  token: z.string().min(10).max(1000),
  answer: z.union([z.string().max(10), z.number()]),
});

const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const CAPTCHA_SECRET = Deno.env.get("CAPTCHA_SECRET")!;
const PEPPER = Deno.env.get("PASSWORD_PEPPER")!;
const admin = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function clientIp(req: Request) {
  // x-real-ip is set by the own nginx proxy; fall back to the platform's first forwarded hop.
  return (
    req.headers.get("x-real-ip")?.trim() ||
    (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() ||
    "unknown"
  );
}

async function lockedUntil(keys: string[]) {
  const { data } = await admin.from("login_attempts").select("key,locked_until").in("key", keys);
  const now = Date.now();
  const until = (data ?? [])
    .map((r) => (r.locked_until ? new Date(r.locked_until).getTime() : 0))
    .filter((t) => t > now);
  return until.length ? Math.max(...until) : 0;
}

async function registerFail(keys: string[]) {
  const { data } = await admin.from("login_attempts").select("key,count").in("key", keys);
  const now = new Date();
  for (const key of keys) {
    const count = (data?.find((r) => r.key === key)?.count ?? 0) + 1;
    const lock = count >= (MAX_FAILS[key.split(":")[0]] ?? 5);
    await admin.from("login_attempts").upsert({
      key,
      count: lock ? 0 : count,
      locked_until: lock ? new Date(now.getTime() + LOCK_MS).toISOString() : null,
      updated_at: now.toISOString(),
    });
  }
}

async function signIn(email: string, password: string) {
  const c = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  return c.auth.signInWithPassword({ email, password });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const path = new URL(req.url).pathname.replace(/^.*\/auth-login/, "") || "/";

    if (req.method === "GET" && path === "/captcha") {
      const c = makeChallenge(() => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32);
      return json({ question: `${c.a} ${c.op} ${c.b}`, token: await signChallenge(CAPTCHA_SECRET, c) });
    }

    if (req.method !== "POST" || path !== "/login") return json({ error: "not_found" }, 404);

    const parsed = Login.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ error: "invalid_input" }, 400);
    const { username, password, token, answer } = parsed.data;

    const ip = clientIp(req);
    // c = username+IP (5), u = username overall (20), ip = IP overall (30)
    const keys = [`c:${username}|${ip}`, `u:${username}`, `ip:${ip}`];
    const locked = await lockedUntil(keys);
    if (locked) return json({ error: "locked", retry_after: Math.ceil((locked - Date.now()) / 1000) }, 429);

    const cap = await verifyChallenge(CAPTCHA_SECRET, token, answer);
    if (!cap.ok) {
      await registerFail(keys);
      return json({ error: `captcha_${cap.reason}` }, 400);
    }
    // One-time use: primary key conflict means the token was already spent.
    const { error: usedErr } = await admin
      .from("captcha_used")
      .insert({ id: cap.id, expires_at: new Date(cap.exp).toISOString() });
    if (usedErr) return json({ error: "captcha_used" }, 400);
    void admin.from("captcha_used").delete().lt("expires_at", new Date().toISOString());

    const email = `${username}@${USERNAME_DOMAIN}`;
    const peppered = await pepperPassword(PEPPER, username, password);
    let { data, error } = await signIn(email, peppered);

    if (error) {
      // Transparent one-time migration of accounts still stored with the plain password.
      const legacy = await signIn(email, password);
      if (!legacy.error && legacy.data.user) {
        await admin.auth.admin.updateUserById(legacy.data.user.id, { password: peppered });
        ({ data, error } = await signIn(email, peppered));
      }
    }

    if (error || !data.session) {
      await registerFail(keys);
      return json({ error: "invalid_credentials" }, 401);
    }

    await admin.from("login_attempts").delete().in("key", [keys[0], keys[1]]);
    return json({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
  } catch (e) {
    console.error(e);
    return json({ error: "server_error" }, 500);
  }
});
