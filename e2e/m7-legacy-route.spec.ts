import { mkdir, writeFile } from "node:fs/promises";
import { expect, test, type Page, type Route } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

const household = { id: "m7-household", name: "M7 House", timezone: "Asia/Tokyo", weekStartsOn: 1, role: "owner" };
const user = { id: "m7-user", email: "m7@example.test", displayName: "M7 User" };

const json = (route: Route, data: unknown, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ ok: true, data, requestId: "m7-legacy" }) });

const installCanonicalApi = async (page: Page) => {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (!path.startsWith("/api/")) return route.continue();
    if (path === "/api/auth/me") return json(route, { user });
    if (path === "/api/households/current") return json(route, { household });
    if (path === "/api/households/current/members") return json(route, { members: [{ ...user, userId: user.id, displayName: user.displayName, role: "owner", color: "#d9f2eb", avatarUrl: null }] });
    if (path === "/api/dashboard/today") return json(route, {
      date: "2026-08-26",
      household,
      summary: { total: 0, pending: 0, inProgress: 0, completed: 0, skipped: 0 },
      todayTasks: [], homeTasks: [], weeklyTasks: [], completedRecords: [], passedRecords: [],
      shopping: { pendingCount: 0, previewItems: [] }, members: []
    });
    if (path === "/api/calendar") return json(route, { month: "2026-08", cells: [], selectedDate: "2026-08-26", tasks: [], shopping: [] });
    if (path === "/api/shopping/items") return json(route, { pending: [], purchased: [] });
    if (path === "/api/households/current/image-usage") return json(route, { activeCount: 0, activeBytes: 0, reservedCount: 0, reservedBytes: 0, pendingCleanupBytes: 0, pendingCleanupUnknownCount: 0, storedBytes: 0, storedBytesKnown: true, activeCountLimit: 50, activeBytesLimit: 52428800, storedBytesLimit: 78643200, dailyUploadLimit: 20 });
    if (path === "/api/tasks/recent") return json(route, { tasks: [] });
    if (path === "/api/shopping/recent") return json(route, { items: [] });
    if (path === "/api/shopping/templates") return json(route, { templates: [] });
    return json(route, {});
  });
};

const legacyCases = [
  ["/settings/members", "/other/members", "メンバー"],
  ["/tasks", "/home", "やること"],
  ["/tasks/task-1", "/tasks/task-1/edit", "家事を編集"],
  ["/tasks/task-1/respond", "/home", "やること"],
  ["/tasks/templates", "/tasks/new", "家事を追加"],
  ["/tasks/templates/template-1/edit", "/tasks/new", "家事を追加"],
  ["/shopping/items/item-1", "/shopping?item=item-1", "買い物"],
  ["/shopping/templates", "/shopping/new", "買い物を追加"],
  ["/shopping/templates/new", "/shopping/new", "買い物を追加"],
  ["/shopping/templates/template-1/edit", "/shopping/new", "買い物を追加"]
] as const;

const legacyResults: Array<{ requestedRoute: string; actualPathname: string; result: "PASS"; oldScreenRendered: false }> = [];

test("M7 legacy route matrix redirects directly to canonical screens", async ({ page }) => {
  await installCanonicalApi(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

  for (const [legacy, canonical, heading] of legacyCases) {
    await page.goto(legacy);
    const target = new URL(canonical, "http://m7.test");
    await expect.poll(() => {
      const current = new URL(page.url());
      return `${current.pathname}${current.search}`;
    }).toBe(`${target.pathname}${target.search}`);
    legacyResults.push({
      requestedRoute: legacy,
      actualPathname: `${new URL(page.url()).pathname}${new URL(page.url()).search}`,
      result: "PASS",
      oldScreenRendered: false
    });
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await expect(page.getByText(/テンプレート|家事の詳細|購入日時/)).toHaveCount(0);
    await page.goBack();
    expect(page.url()).not.toContain(legacy);
  }
  expect(errors).toEqual([]);
});

test("M7 guest and onboarding keep the M6 state redirect without rendering legacy UI", async ({ page }) => {
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (!path.startsWith("/api/")) return route.continue();
    if (path === "/api/auth/me") return route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ ok: false, error: { code: "UNAUTHENTICATED" } }) });
    return json(route, {});
  });
  for (const path of ["/guest", "/onboarding"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "ログイン" })).toBeVisible();
    await expect(page.getByText(/ゲスト|オンボーディング/)).toHaveCount(0);
    legacyResults.push({ requestedRoute: path, actualPathname: new URL(page.url()).pathname, result: "PASS", oldScreenRendered: false });
  }
  await mkdir("docs/evidence/m7/diagnostics", { recursive: true });
  await writeFile(
    "docs/evidence/m7/diagnostics/legacy-route-results.json",
    JSON.stringify({ generatedAt: new Date().toISOString(), sourceTest: "e2e/m7-legacy-route.spec.ts", routes: legacyResults }, null, 2) + "\n",
    "utf8"
  );
});
