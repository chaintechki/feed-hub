import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Visibility rules for normal admins. Needs pre-minted sessions (login has a captcha):
 *   E2E_API_URL, E2E_STORAGE_KEY, E2E_SUPER_SESSION, E2E_ADMIN_SESSION (session JSON)
 */
const API = process.env.E2E_API_URL;
const KEY = process.env.E2E_STORAGE_KEY;
const SUPER = process.env.E2E_SUPER_SESSION;
const ADMIN = process.env.E2E_ADMIN_SESSION;
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:8080";

test.skip(!API || !KEY || !SUPER || !ADMIN, "sessions not provided");

const session = (s: string) => JSON.parse(s) as { access_token: string; user: { id: string; user_metadata?: { username?: string } } };

async function call(req: APIRequestContext, s: string, fn: string, body: unknown) {
  const r = await req.post(`${API}/functions/v1/${fn}`, {
    headers: { Authorization: `Bearer ${session(s).access_token}`, Origin: BASE, "Content-Type": "application/json" },
    data: body,
  });
  return { status: r.status(), body: await r.json() };
}

async function signIn(page: Page, s: string) {
  await page.goto("/auth");
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY!, s]);
}

test.describe("normal admin visibility", () => {
  const hiddenName = `e2e-hidden-${Date.now()}`;
  let clientId = "";

  test.beforeAll(async ({ request }) => {
    const created = await call(request, SUPER!, "api-clients-admin", {
      action: "save",
      client: { name: hiddenName, active: false, sport_ids: [], tournament_ids: [], markup_pct: 0, rate_limit_per_min: 30, allowed_domains: [], formats: ["json"], market_groups: [] },
    });
    expect(created.status).toBe(200);
    clientId = created.body.id ?? created.body.client?.id;
    const ex = await call(request, SUPER!, "api-clients-admin", { action: "set_exclusions", id: clientId, admin_ids: [session(ADMIN!).user.id] });
    expect(ex.status).toBe(200);
  });

  test.afterAll(async ({ request }) => {
    if (clientId) await call(request, SUPER!, "api-clients-admin", { action: "delete", id: clientId });
  });

  test("user list never contains a super admin", async ({ request }) => {
    const superId = session(SUPER!).user.id;
    const r = await call(request, ADMIN!, "admin-users", { action: "list" });
    expect(r.status).toBe(200);
    const ids = r.body.users.map((u: { id: string }) => u.id);
    expect(ids).not.toContain(superId);
    expect(r.body.users.every((u: { role: string }) => u.role !== "super_admin")).toBe(true);
    const owners = await call(request, ADMIN!, "api-clients-admin", { action: "users" });
    expect(owners.body.users.map((u: { id: string }) => u.id)).not.toContain(superId);
  });

  test("excluded client is not delivered and direct access is denied", async ({ request }) => {
    const list = await call(request, ADMIN!, "api-clients-admin", { action: "list" });
    expect(list.body.clients.map((c: { id: string }) => c.id)).not.toContain(clientId);
    const direct = await call(request, ADMIN!, "api-clients-admin", { action: "assign", id: clientId, owner_id: null });
    expect(direct.status).toBe(403);
  });

  test("hidden client and super admin never flash while switching users", async ({ page }) => {
    const superName = session(SUPER!).user.user_metadata?.username ?? "chaintech";
    // Record every text that ever appears in the DOM, from the very first render.
    await page.addInitScript(() => {
      (window as unknown as { __seen: string[] }).__seen = [];
      new MutationObserver(() => {
        (window as unknown as { __seen: string[] }).__seen.push(document.body?.innerText ?? "");
      }).observe(document, { subtree: true, childList: true, characterData: true });
    });
    await signIn(page, SUPER!);
    await page.goto("/configuration");
    await expect(page.getByText(hiddenName)).toBeVisible({ timeout: 15000 });

    await page.evaluate(() => ((window as unknown as { __seen: string[] }).__seen = []));
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY!, ADMIN!]);
    await page.goto("/configuration");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);

    const seen = await page.evaluate(() => (window as unknown as { __seen: string[] }).__seen.join("\n"));
    expect(seen).not.toContain(hiddenName);
    expect(seen.toLowerCase()).not.toContain(`${superName.toLowerCase()}\t`);
  });

  test("audit log records the change and is immutable", async ({ request }) => {
    const s = session(SUPER!);
    const h = { apikey: process.env.E2E_ANON_KEY ?? "", Authorization: `Bearer ${s.access_token}` };
    const rows = await request.get(`${API}/rest/v1/audit_log?entity_id=eq.${clientId}&select=id,action,user_id,hash`, { headers: h });
    const data = await rows.json();
    expect(data.some((r: { action: string; user_id: string }) => r.action === "api_client.exclusions" && r.user_id === s.user.id)).toBe(true);
    expect(data.every((r: { hash: string }) => /^[0-9a-f]{64}$/.test(r.hash))).toBe(true);
    const del = await request.delete(`${API}/rest/v1/audit_log?id=eq.${data[0].id}`, { headers: { ...h, Prefer: "return=representation" } });
    expect(await del.json()).toEqual([]);
    const v = await request.post(`${API}/rest/v1/rpc/audit_verify`, { headers: h, data: {} });
    expect((await v.json())[0].ok).toBe(true);
  });
});
