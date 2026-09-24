import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { db } from "../_shared/feed.ts";
import { originAllowed, overUserLimit } from "../_shared/guard.ts";

const Body = z.object({ matchId: z.string().regex(/^sr:(match|stage|season_event):\d{1,15}$/) });
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!originAllowed(req)) return json({ error: "Forbidden origin" }, 403);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
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

    const { data: roles } = await sb.from("user_roles").select("role").eq("user_id", me);
    const allowed = (roles ?? []).some((r) => ["super_admin", "admin", "trader"].includes(r.role));
    if (!allowed) return json({ error: "Forbidden" }, 403);
    if (await overUserLimit(sb, me, "uof-book", 30)) return json({ error: "Too many requests" }, 429);

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ error: "Invalid match" }, 400);
    const { matchId } = parsed.data;

    const { data: match } = await sb.from("matches").select("id,liveodds").eq("id", matchId).maybeSingle();
    if (!match) return json({ error: "Match not found" }, 404);
    if (match.liveodds === "booked") return json({ ok: true, already: true });
    if (match.liveodds !== "bookable") return json({ error: "Match is not bookable" }, 409);

    const host = Deno.env.get("UOF_API_HOST")!;
    const r = await fetch(`https://${host}/v1/liveodds/booking-calendar/events/${encodeURIComponent(matchId)}/book`, {
      method: "POST",
      headers: { "x-access-token": Deno.env.get("UOF_ACCESS_TOKEN")! },
      signal: AbortSignal.timeout(15_000),
    });
    const text = await r.text();
    if (!r.ok) {
      console.error("book failed", r.status, text.slice(0, 300));
      return json({ error: "Provider rejected booking", status: r.status }, 502);
    }
    await sb.from("matches").update({ liveodds: "booked", booked: true, updated_at: new Date().toISOString() }).eq("id", matchId);
    await sb.from("audit_log").insert({ user_id: me, action: "match_booked", entity: "match", entity_id: matchId, details: null });
    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: "Internal error" }, 500);
  }
});
