// Pure visibility rules shared by admin edge functions (unit-tested in src/lib/visibility.test.ts).

export type RoleRow = { user_id: string; role: string };
export type Exclusion = { client_id: string; admin_id: string };

export function superAdminIds(roles: RoleRow[]): Set<string> {
  return new Set(roles.filter((r) => r.role === "super_admin").map((r) => r.user_id));
}

/** Normal admins never receive super admins; super admins see everyone. */
export function visibleUsers<T extends { id: string }>(users: T[], roles: RoleRow[], viewerIsSuper: boolean): T[] {
  if (viewerIsSuper) return users;
  const supers = superAdminIds(roles);
  return users.filter((u) => !supers.has(u.id));
}

/** Super: all. Admin: all except clients excluded for them. Others: only owned clients. */
export function visibleClients<T extends { id: string; owner_id?: string | null }>(
  clients: T[],
  exclusions: Exclusion[],
  me: string,
  isSuper: boolean,
  isAdmin: boolean,
): T[] {
  if (isSuper) return clients;
  if (isAdmin) return clients.filter((c) => !exclusions.some((e) => e.client_id === c.id && e.admin_id === me));
  return clients.filter((c) => c.owner_id === me);
}

/** Mirrors public.audit_hash() in the database, used to verify exported audit chains. */
export async function auditHash(e: {
  prev: string | null;
  seq: number;
  user_id: string | null;
  action: string;
  entity: string | null;
  entity_id: string | null;
  details: string | null;
  at: string; // "YYYY-MM-DDTHH:MM:SS.ffffff" UTC
}): Promise<string> {
  const s = [e.prev ?? "", String(e.seq), e.user_id ?? "", e.action, e.entity ?? "", e.entity_id ?? "", e.details ?? "", e.at].join("|");
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function requestMeta(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || null;
  return { ip, ua: (req.headers.get("user-agent") ?? "").slice(0, 200) || null };
}
