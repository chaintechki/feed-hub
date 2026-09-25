import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * Monitoring filters against a large synthetic feed (3,000 matches, several result pages).
 * All backend requests are answered in the browser, so the test is deterministic and
 * needs no credentials.
 */
const TOTAL = 3000;
const STORAGE_KEY = "sb-uiwdzymvvnlxlfeqfilo-auth-token";
const USER_ID = "00000000-0000-4000-8000-000000000001";
const NOW = Date.now();
const SPORTS = [
  { id: "sr:sport:1", name: "Soccer" },
  { id: "sr:sport:2", name: "Basketball" },
  { id: "sr:sport:5", name: "Tennis" },
];

type Row = Record<string, unknown> & { id: string };
const idx = (id: string) => Number(id.split(":").pop());
const at = (i: number) => new Date(NOW + (0.51 + i * 0.02) * 3600_000).toISOString();

const matches: Row[] = Array.from({ length: TOTAL }, (_, i) => {
  const sport = SPORTS[i % 3];
  return {
    id: `sr:match:${i}`,
    sport_id: sport.id,
    category_id: `sr:category:${i % 3}`,
    tournament_id: `sr:tournament:${i % 30}`,
    home_team: `Home ${i}`,
    away_team: `Away ${i}`,
    scheduled: at(i),
    status: "not_started",
    liveodds: "booked",
    match_minute: null,
    booked: true,
    suspended: false,
    hotlisted: i % 17 === 0,
    alerted: i % 13 === 0,
    control_mode: i % 5 === 0 ? "manual" : "automatic",
    comment_count: 0,
    early_odds: false,
    provider_only: false,
    margin_skewed: false,
  };
});

function oddsFor(i: number): Row[] {
  const base = { match_id: `sr:match:${i}`, source: "own", market: "1x2", specifier: null, margin: null, control_mode: "automatic", market_group: "main", alerted: false, updated_at: new Date(NOW).toISOString() };
  if (i % 7 === 0) return [{ ...base, id: `o${i}`, suspended: false, outcomes: [{ label: "1", odds: 2.1, active: true }, { label: "X", odds: 3.2, active: true }, { label: "2", odds: 3.4, active: true }] }];
  if (i % 7 === 3) return [{ ...base, id: `o${i}`, suspended: true, outcomes: [{ label: "1", odds: 2.1, active: true }] }];
  if (i % 7 === 5) return [{ ...base, id: `o${i}`, suspended: false, outcomes: [{ label: "1", odds: null, active: true }] }];
  return [];
}

const tables: Record<string, Row[]> = {
  sports: SPORTS.map((s, n) => ({ ...s, sort_order: n })),
  categories: [0, 1, 2].map((n) => ({ id: `sr:category:${n}`, sport_id: SPORTS[n].id, name: `Country ${n}`, country_code: null })),
  tournaments: Array.from({ length: 30 }, (_, n) => ({ id: `sr:tournament:${n}`, category_id: `sr:category:${n % 3}`, sport_id: SPORTS[n % 3].id, name: `League ${n}` })),
  user_roles: [{ role: "admin", user_id: USER_ID }],
  user_settings: [],
};

function inList(value: string | null) {
  const m = value?.match(/^in\.\((.*)\)$/);
  return m ? m[1].split(",").map((s) => s.replace(/^"|"$/g, "")) : null;
}

async function answer(route: Route) {
  const url = new URL(route.request().url());
  const table = url.pathname.split("/").pop()!;
  let rows: Row[];
  if (table === "matches") {
    const status = inList(url.searchParams.get("status"));
    rows = status ? matches.filter((m) => status.includes(m.status as string)) : matches;
  } else if (table === "match_odds") {
    const ids = inList(url.searchParams.get("match_id")) ?? [];
    rows = ids.flatMap((id) => oddsFor(idx(id)));
  } else {
    rows = tables[table] ?? [];
  }
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const limit = url.searchParams.has("limit") ? Number(url.searchParams.get("limit")) : rows.length;
  const page = rows.slice(offset, offset + limit);
  const single = (route.request().headers()["accept"] ?? "").includes("vnd.pgrst.object");
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "content-range": `${offset}-${offset + page.length - 1}/${rows.length}`, "access-control-expose-headers": "content-range" },
    body: JSON.stringify(single ? page[0] ?? null : route.request().method() === "HEAD" ? [] : page),
  });
}

async function openMonitoring(page: Page) {
  await page.route(/\/rest\/v1\//, answer);
  await page.route(/\/functions\/v1\//, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.route(/\/auth\/v1\//, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: USER_ID }) }));
  await page.route(/\/realtime\/v1\//, (r) => r.abort());
  await page.goto("/auth");
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const exp = Math.floor(NOW / 1000) + 3600 * 24;
  const token = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: USER_ID, exp, role: "authenticated" })}.sig`;
  const session = {
    access_token: token, refresh_token: "e2e", token_type: "bearer", expires_in: 86400, expires_at: exp,
    user: { id: USER_ID, aud: "authenticated", role: "authenticated", email: "e2e@feedpanel.local", app_metadata: {}, user_metadata: { username: "e2e" }, created_at: new Date(NOW).toISOString() },
  };
  await page.evaluate(([k, v]) => { localStorage.clear(); localStorage.setItem(k, v); }, [STORAGE_KEY, JSON.stringify(session)]);
  await page.goto("/monitoring/matches");
  await expect(page.getByTestId("match-row").first()).toBeVisible({ timeout: 20_000 });
}

const expectCount = (page: Page, n: number) => expect(page.getByTestId("match-scroll")).toHaveAttribute("data-count", String(n));
const rowIds = async (page: Page) =>
  (await page.getByTestId("match-row").evaluateAll((els) => els.map((e) => e.getAttribute("data-match-id")!))).map(idx);
const filterButton = (page: Page, name: RegExp) => page.getByRole("button", { name, exact: false }).first();
const range = (pred: (i: number) => boolean) => Array.from({ length: TOTAL }, (_, i) => i).filter(pred);
const within24h = (i: number) => 0.51 + i * 0.02 < 24;

test.describe("monitoring filters with a large feed", () => {
  test.describe.configure({ timeout: 90_000 });
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
    await openMonitoring(page);
  });

  test("without filters all matches are listed but only visible rows are rendered", async ({ page }) => {
    const total = Number(await page.getByTestId("match-scroll").getAttribute("data-count"));
    expect(total).toBeGreaterThan(500);
    expect(await page.getByTestId("match-row").count()).toBeLessThan(120);
    await expect(page.getByTestId("active-filters")).toHaveCount(0);
    await expect(page.getByTestId("load-progress")).toContainText(/of/);
  });

  test("scrolling lazily renders rows further down", async ({ page }) => {
    const first = (await rowIds(page))[0];
    await page.getByTestId("match-scroll").evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await expect.poll(async () => (await rowIds(page)).includes(first!)).toBe(false);
  });

  test("'with odds' shows exactly the matches with open numeric odds, also beyond the first page", async ({ page }) => {
    await filterButton(page, /^with odds$/i).click();
    const expected = range((i) => i % 7 === 0);
    await expectCount(page, expected.length);
    await page.getByPlaceholder(/find|suchen/i).fill("Home 2996 ");
    await expect.poll(async () => rowIds(page)).toEqual([2996]); // lives on the third result page
  });

  test("combined filters intersect", async ({ page }) => {
    await filterButton(page, /^with odds$/i).click();
    await filterButton(page, /^alerted$/i).click();
    const expected = range((i) => i % 7 === 0 && i % 13 === 0);
    await expectCount(page, expected.length);
    await expect.poll(async () => (await rowIds(page)).sort((a, b) => a - b)).toEqual(expected);
  });

  test("hotlist within 24 hours", async ({ page }) => {
    await filterButton(page, /^hotlist/i).click();
    await filterButton(page, /^24 hours$/i).click();
    const expected = range((i) => i % 17 === 0 && within24h(i));
    await expectCount(page, expected.length);
    await expect.poll(async () => (await rowIds(page)).sort((a, b) => a - b)).toEqual(expected);
  });

  test("manual control plus search term", async ({ page }) => {
    await filterButton(page, /^manual$/i).click();
    await page.getByPlaceholder(/find|suchen/i).fill("Home 299");
    const expected = range((i) => i % 5 === 0 && `Home ${i} Away ${i} League ${i % 30}`.toLowerCase().includes("home 299"));
    await expectCount(page, expected.length);
    await expect.poll(async () => (await rowIds(page)).sort((a, b) => a - b)).toEqual(expected);
  });

  test("active filter chips list filters and remove them individually", async ({ page }) => {
    const TOTAL_VISIBLE = Number(await page.getByTestId("match-scroll").getAttribute("data-count"));
    await filterButton(page, /^with odds$/i).click();
    await filterButton(page, /^alerted$/i).click();
    await page.getByPlaceholder(/find|suchen/i).fill("Home");
    const chips = page.getByTestId("active-filter-chip");
    await expect(chips).toHaveCount(3);

    await page.getByRole("button", { name: /remove filter: alerted/i }).click();
    await expect(chips).toHaveCount(2);
    await expectCount(page, range((i) => i % 7 === 0).length);

    await page.getByRole("button", { name: /clear all/i }).click();
    await expect(page.getByTestId("active-filters")).toHaveCount(0);
    await expectCount(page, TOTAL_VISIBLE);
    await expect(page.getByPlaceholder(/find|suchen/i)).toHaveValue("");
  });
});
