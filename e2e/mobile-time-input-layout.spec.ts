import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const artifactDir = path.resolve(
  process.env.PLAYWRIGHT_ARTIFACT_DIR ?? "artifacts/playwright/mobile-time-input-layout"
);

const json = (data: unknown, status = 200) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify({ ok: true, data, requestId: "mobile-time-input-layout-e2e" })
});

const screenshot = async (page: Page, name: string) => {
  await mkdir(artifactDir, { recursive: true });
  await page.screenshot({ path: path.join(artifactDir, name), fullPage: false });
};

const settleForScreenshot = async (page: Page, inputSelector: string) => {
  await page.locator(inputSelector).blur();
  const resetScroll = () => page.evaluate(() => {
    document.querySelector<HTMLElement>(".app-shell")?.scrollTo({ top: 0, left: 0 });
    document.querySelector<HTMLElement>(".app-shell__viewport")?.scrollTo({ top: 0, left: 0 });
  });
  await resetScroll();
  await page.waitForTimeout(100);
  await resetScroll();
};

const assertCompactInputLayout = async (page: Page, inputSelector: string) => {
  const metrics = await page.evaluate((selector) => {
    const input = document.querySelector<HTMLInputElement>(selector);
    const row = input?.closest<HTMLElement>(".mobile-compact-input-row");
    const label = row?.querySelector<HTMLLabelElement>("label");
    const rowBox = row?.getBoundingClientRect();
    const inputBox = input?.getBoundingClientRect();
    const labelBox = label?.getBoundingClientRect();
    return {
      viewportWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      row: rowBox ? { left: rowBox.left, right: rowBox.right, height: rowBox.height } : null,
      input: inputBox ? { left: inputBox.left, right: inputBox.right, width: inputBox.width } : null,
      label: labelBox ? { left: labelBox.left, right: labelBox.right } : null
    };
  }, inputSelector);

  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.row).not.toBeNull();
  expect(metrics.input).not.toBeNull();
  expect(metrics.label).not.toBeNull();
  expect(metrics.row!.left).toBeGreaterThanOrEqual(-1);
  expect(metrics.row!.right).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.row!.height).toBeGreaterThanOrEqual(48);
  expect(metrics.row!.height).toBeLessThan(88);
  expect(metrics.label!.left).toBeGreaterThanOrEqual(-1);
  expect(metrics.input!.right).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.input!.width).toBeGreaterThan(0);
};

const assertSubmitReachable = async (page: Page) => {
  const submit = page.locator('form button[type="submit"]');
  await submit.scrollIntoViewIfNeeded();
  await expect(submit).toBeVisible();
  const box = await submit.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x + box!.width).toBeLessThanOrEqual((await page.evaluate(() => window.innerWidth)) + 1);
};

type TaskState = {
  createdPayloads: Array<Record<string, unknown>>;
  updatePayloads: Array<Record<string, unknown>>;
};

const installTaskRoutes = async (page: Page, state: TaskState) => {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/auth/me") return route.fulfill(json({ user: { id: "user-1", email: "e2e@example.test", displayName: "はる" } }));
    if (url.pathname === "/api/households/current") return route.fulfill(json({ household: { id: "household-1", name: "わが家", timezone: "Asia/Tokyo", weekStartsOn: 1, role: "owner" } }));
    if (url.pathname === "/api/households/current/members") return route.fulfill(json({ members: [{ userId: "user-1", displayName: "はる", role: "owner", color: "#d9f2eb", avatarUrl: null }] }));
    if (url.pathname === "/api/tasks/recent") return route.fulfill(json({ tasks: [] }));
    if (url.pathname === "/api/tasks/task-edit" && request.method() === "GET") return route.fulfill(json({ task: { id: "task-edit", title: "編集する家事", description: "メモ", recurrenceType: "daily", modelRecurrenceType: "daily", assignmentType: "anyone", assignedUserId: null, startDate: "2026-09-01", targetDate: null, deadlineTime: "09:00", notificationOffsetMinutes: 10, weekdays: [], weeklyTargetCount: null, active: true } }));
    if (url.pathname === "/api/tasks/task-edit/history") return route.fulfill(json({ records: [] }));
    if (url.pathname === "/api/tasks" && request.method() === "POST") {
      state.createdPayloads.push(request.postDataJSON() as Record<string, unknown>);
      return route.fulfill(json({ task: { id: "task-created" } }, 201));
    }
    if (url.pathname === "/api/tasks/task-edit" && request.method() === "PATCH") {
      state.updatePayloads.push(request.postDataJSON() as Record<string, unknown>);
      return route.fulfill(json({ task: { id: "task-edit", deadlineTime: "18:30" } }));
    }
    if (url.pathname === "/api/home/today") return route.fulfill(json({ date: "2026-09-01", homeTasks: [], completedRecords: [], passedRecords: [], shopping: { pendingCount: 0 }, members: [] }));
    throw new Error(`Unexpected task API request: ${request.method()} ${url.pathname}`);
  });
};

test.describe("mobile-safe Task date and time inputs", () => {
  test("keeps the start date and time rows compact at every target viewport and preserves create/edit values", async ({ page }) => {
    const state: TaskState = { createdPayloads: [], updatePayloads: [] };
    await installTaskRoutes(page, state);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/tasks/new");
    await expect(page.getByRole("heading", { name: "家事を追加" })).toBeVisible();
    await expect(page.locator("#m2-task-start-date")).toHaveValue("2026-09-01");
    await assertCompactInputLayout(page, "#m2-task-start-date");
    await expect(page.locator("#m2-task-time")).toHaveCount(0);
    await page.getByRole("checkbox", { name: "終日" }).click();
    await expect(page.locator("#m2-task-time")).toHaveValue("09:00");
    await assertCompactInputLayout(page, "#m2-task-start-date");
    await assertCompactInputLayout(page, "#m2-task-time");
    await screenshot(page, "task-new-time-390x844.png");
    await page.locator("#m2-task-time").focus();
    await screenshot(page, "task-time-focused-390x844.png");
    await page.locator("#m2-task-title").fill("朝の片付け");
    await page.locator('form button[type="submit"]').click();
    await expect(page).toHaveURL("/home");
    expect(state.createdPayloads[0]).toMatchObject({ startDate: "2026-09-01", deadlineTime: "09:00" });

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/tasks/new");
    await expect(page.locator("#m2-task-start-date")).toHaveValue("2026-09-01");
    await page.getByRole("checkbox", { name: "終日" }).click();
    await page.locator("#m2-task-start-date").fill("2026-09-01");
    await page.locator("#m2-task-time").fill("23:59");
    await assertCompactInputLayout(page, "#m2-task-start-date");
    await assertCompactInputLayout(page, "#m2-task-time");
    await settleForScreenshot(page, "#m2-task-time");
    await screenshot(page, "task-new-time-375x812.png");

    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/tasks/task-edit/edit");
    await expect(page.locator("#m2-task-start-date")).toHaveValue("2026-09-01");
    await expect(page.locator("#m2-task-time")).toHaveValue("09:00");
    await assertCompactInputLayout(page, "#m2-task-start-date");
    await assertCompactInputLayout(page, "#m2-task-time");
    await screenshot(page, "task-edit-time-375x667.png");
    await page.locator("#m2-task-start-date").fill("2026-09-05");
    await page.locator("#m2-task-time").fill("18:30");
    await page.locator('form button[type="submit"]').click();
    await expect(page).toHaveURL("/home");
    expect(state.updatePayloads[0]).toMatchObject({ startDate: "2026-09-05", deadlineTime: "18:30" });

    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/tasks/new");
    await expect(page.locator("#m2-task-start-date")).toHaveValue("2026-09-01");
    await assertCompactInputLayout(page, "#m2-task-start-date");
    await expect(page.locator("#m2-task-time")).toHaveCount(0);
    await page.getByRole("checkbox", { name: "終日" }).click();
    await page.locator("#m2-task-start-date").fill("2026-09-01");
    await page.locator("#m2-task-time").fill("00:00");
    await assertCompactInputLayout(page, "#m2-task-start-date");
    await assertCompactInputLayout(page, "#m2-task-time");
    await assertSubmitReachable(page);
    await settleForScreenshot(page, "#m2-task-time");
    await screenshot(page, "task-new-time-320x568.png");

    await page.getByRole("checkbox", { name: "終日" }).click();
    await expect(page.locator("#m2-task-time")).toHaveCount(0);
  });
});

type ShoppingState = {
  createdPayloads: Array<Record<string, unknown>>;
  updatePayloads: Array<Record<string, unknown>>;
};

const shoppingItem = (plannedPurchaseDate: string | null) => ({
  id: "shopping-edit",
  name: "牛乳",
  quantity: "1本",
  note: null,
  plannedPurchaseDate,
  status: "pending",
  addedBy: "user-1",
  purchasedBy: null,
  purchasedAt: null,
  sortOrder: 1,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  image: null
});

const installShoppingRoutes = async (page: Page, state: ShoppingState) => {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/auth/me") return route.fulfill(json({ user: { id: "user-1", email: "e2e@example.test", displayName: "はる" } }));
    if (url.pathname === "/api/households/current") return route.fulfill(json({ household: { id: "household-1", name: "わが家", timezone: "Asia/Tokyo", weekStartsOn: 1, role: "owner" } }));
    if (url.pathname === "/api/households/current/members") return route.fulfill(json({ members: [{ userId: "user-1", displayName: "はる", role: "owner", color: "#d9f2eb", avatarUrl: null }] }));
    if (url.pathname === "/api/households/current/image-usage") return route.fulfill(json({ activeCount: 0, activeBytes: 0, reservedCount: 0, reservedBytes: 0, pendingCleanupBytes: 0, pendingCleanupUnknownCount: 0, storedBytes: 0, storedBytesKnown: true, activeCountLimit: 50, activeBytesLimit: 52428800, storedBytesLimit: 78643200, dailyUploadLimit: 20 }));
    if (url.pathname === "/api/shopping/recent") return route.fulfill(json({ items: [] }));
    if (url.pathname === "/api/shopping/templates") return route.fulfill(json({ templates: [] }));
    if (url.pathname === "/api/shopping/items" && request.method() === "GET") return route.fulfill(json({ pending: [], purchased: [] }));
    if (url.pathname === "/api/shopping/items" && request.method() === "POST") {
      state.createdPayloads.push(request.postDataJSON() as Record<string, unknown>);
      return route.fulfill(json({ item: shoppingItem((request.postDataJSON() as Record<string, unknown>).plannedPurchaseDate as string ?? null) }, 201));
    }
    if (url.pathname === "/api/shopping/items/shopping-edit" && request.method() === "GET") return route.fulfill(json({ item: shoppingItem("2026-09-01") }));
    if (url.pathname === "/api/shopping/items/shopping-edit" && request.method() === "PATCH") {
      state.updatePayloads.push(request.postDataJSON() as Record<string, unknown>);
      return route.fulfill(json({ item: shoppingItem((request.postDataJSON() as Record<string, unknown>).plannedPurchaseDate as string ?? null) }));
    }
    throw new Error(`Unexpected shopping API request: ${request.method()} ${url.pathname}`);
  });
};

test.describe("mobile-safe Shopping planned purchase date input", () => {
  test("keeps the date row compact at every target viewport and preserves create/edit/clear values", async ({ page }) => {
    const state: ShoppingState = { createdPayloads: [], updatePayloads: [] };
    await installShoppingRoutes(page, state);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/shopping/new");
    await expect(page.getByRole("heading", { name: "買い物を追加" })).toBeVisible();
    await expect(page.getByLabel("購入予定日")).toHaveValue("");
    await assertCompactInputLayout(page, "#shopping-planned-purchase-date");
    await page.getByLabel("購入予定日").fill("2026-09-01");
    await expect(page.getByLabel("購入予定日")).toHaveValue("2026-09-01");
    await assertCompactInputLayout(page, "#shopping-planned-purchase-date");
    await settleForScreenshot(page, "#shopping-planned-purchase-date");
    await screenshot(page, "shopping-new-date-390x844.png");
    await page.locator("#shopping-name").fill("牛乳");
    await page.locator('form button[type="submit"]').click();
    await expect(page).toHaveURL(/\/shopping\?item=/);
    expect(state.createdPayloads[0]).toMatchObject({ plannedPurchaseDate: "2026-09-01" });

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/shopping/new");
    await page.getByLabel("購入予定日").fill("2026-09-01");
    await assertCompactInputLayout(page, "#shopping-planned-purchase-date");
    await settleForScreenshot(page, "#shopping-planned-purchase-date");
    await screenshot(page, "shopping-date-375x812.png");

    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/shopping/items/shopping-edit/edit");
    await expect(page.getByLabel("購入予定日")).toHaveValue("2026-09-01");
    await assertCompactInputLayout(page, "#shopping-planned-purchase-date");
    await screenshot(page, "shopping-edit-date-375x667.png");
    await page.getByLabel("購入予定日").fill("2026-09-03");
    await page.locator('form button[type="submit"]').click();
    await expect(page).toHaveURL(/\/shopping\?item=/);
    expect(state.updatePayloads[0]).toMatchObject({ plannedPurchaseDate: "2026-09-03" });

    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/shopping/new");
    await expect(page.getByLabel("購入予定日")).toBeVisible();
    await assertCompactInputLayout(page, "#shopping-planned-purchase-date");
    await assertSubmitReachable(page);
    await settleForScreenshot(page, "#shopping-planned-purchase-date");
    await screenshot(page, "shopping-new-date-320x568.png");

    await page.getByLabel("購入予定日").fill("2026-09-04");
    await page.getByLabel("購入予定日").fill("");
    await expect(page.getByLabel("購入予定日")).toHaveValue("");
    await page.locator("#shopping-name").fill("牛乳");
    await page.locator('form button[type="submit"]').click();
    expect(state.createdPayloads.at(-1)).toMatchObject({ plannedPurchaseDate: null });
  });
});
