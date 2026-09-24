// Shared request guards for admin edge functions.
// deno-lint-ignore-file no-explicit-any

/** Origin allow-list from ALLOWED_ORIGINS (exact origins or ".suffix" entries). Empty = allow all. */
export function originAllowed(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return true; // server-to-server / curl: protected by bearer token
  const rules = (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!rules.length) return true;
  let host = "";
  try {
    host = new URL(origin).hostname;
  } catch {
    return false;
  }
  return rules.some((r) => (r.startsWith(".") ? host.endsWith(r) : r === origin));
}

/** Per-user sliding-window limit using public.rate_events (service role client). */
export async function overUserLimit(admin: any, userId: string, bucket: string, limit: number) {
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await admin
    .from("rate_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("bucket", bucket)
    .gt("at", since);
  if ((count ?? 0) >= limit) return true;
  await admin.from("rate_events").insert({ user_id: userId, bucket });
  return false;
}

/** k-anonymity check against the public leaked-password range API. Fails open on network errors. */
export async function passwordLeaked(password: string) {
  try {
    const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(password));
    const hex = Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
    const res = await fetch(`https://api.pwnedpasswords.com/range/${hex.slice(0, 5)}`, {
      headers: { "Add-Padding": "true" },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return false;
    const suffix = hex.slice(5);
    return (await res.text()).split("\n").some((l) => {
      const [s, n] = l.trim().split(":");
      return s === suffix && Number(n) > 0;
    });
  } catch {
    return false;
  }
}
