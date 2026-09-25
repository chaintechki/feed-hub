import { describe, expect, it } from "vitest";

import { auditHash, visibleClients, visibleUsers } from "../../supabase/functions/_shared/visibility.ts";

const SUPER = "00000000-0000-0000-0000-00000000000a";
const ADMIN = "00000000-0000-0000-0000-00000000000b";
const TRADER = "00000000-0000-0000-0000-00000000000c";
const roles = [
  { user_id: SUPER, role: "super_admin" },
  { user_id: SUPER, role: "admin" },
  { user_id: ADMIN, role: "admin" },
  { user_id: TRADER, role: "trader" },
];
const users = [{ id: SUPER }, { id: ADMIN }, { id: TRADER }];

describe("user list visibility", () => {
  it("normal admins never receive super admins", () => {
    const ids = visibleUsers(users, roles, false).map((u) => u.id);
    expect(ids).not.toContain(SUPER);
    expect(ids).toEqual([ADMIN, TRADER]);
  });
  it("super admins see everyone", () => {
    expect(visibleUsers(users, roles, true)).toHaveLength(3);
  });
});

describe("client visibility", () => {
  const clients = [
    { id: "c1", owner_id: TRADER },
    { id: "c2", owner_id: null },
    { id: "c3", owner_id: null },
  ];
  const ex = [{ client_id: "c2", admin_id: ADMIN }];
  it("excluded clients are hidden from that admin", () => {
    expect(visibleClients(clients, ex, ADMIN, false, true).map((c) => c.id)).toEqual(["c1", "c3"]);
  });
  it("exclusions for other admins do not apply", () => {
    expect(visibleClients(clients, [{ client_id: "c2", admin_id: "other" }], ADMIN, false, true)).toHaveLength(3);
  });
  it("super admin sees excluded clients", () => {
    expect(visibleClients(clients, ex, SUPER, true, true)).toHaveLength(3);
  });
  it("traders only see owned clients", () => {
    expect(visibleClients(clients, ex, TRADER, false, false).map((c) => c.id)).toEqual(["c1"]);
  });
});

describe("audit hash chain", () => {
  const base = { seq: 1, user_id: ADMIN, action: "role.grant", entity: "user", entity_id: TRADER, details: '{"role": "admin"}', at: "2026-09-25T20:00:00.000000" };
  it("is deterministic and chained", async () => {
    const h1 = await auditHash({ ...base, prev: null });
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(await auditHash({ ...base, prev: null })).toBe(h1);
    const h2 = await auditHash({ ...base, seq: 2, prev: h1 });
    expect(h2).not.toBe(h1);
  });
  it("detects any tampering", async () => {
    const h = await auditHash({ ...base, prev: null });
    expect(await auditHash({ ...base, prev: null, action: "role.revoke" })).not.toBe(h);
    expect(await auditHash({ ...base, prev: null, user_id: SUPER })).not.toBe(h);
    expect(await auditHash({ ...base, prev: "x" })).not.toBe(h);
  });
});
