import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

const artifactRoot = path.resolve(process.env.PLAYWRIGHT_ARTIFACT_DIR ?? "artifacts/playwright/delayed-refresh-status");
const user = { id: "user-1", email: "delayed-refresh@example.test", displayName: "更新検証者", avatarUrl: null };
const household = { id: "household-1", name: "更新検証家庭", timezone: "Asia/Tokyo", weekStartsOn: 1, role: "owner" as const };
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: household.timezone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
}).format(new Date());

const task = {
  id: "delayed-task",
  title: "遅延表示を確認する家事",
  description: "",
  recurrenceType: "daily",
  modelRecurrenceType: "daily",
  assignmentType: "anyone",
  assignedUserId: null,
  assignment: { type: "anyone", user: null },
  scheduledTime: null,
  notificationSlot: "none",
  weekdays: [],
  weeklyTargetCount: null,
  active: true,
  sortOrder: 0,
  createdBy: user.id,
  createdAt: `${today}T00:00:00.000Z`,
  updatedAt: `${today}T00:00:00.000Z`,
  status: "pending",
  actedBy: null,
  startedAt: null,
  completedAt: null,
  skippedAt: null,
  note: null,
  targetDate: today,
  deadlineDate: today,
  deadlineTime: null,
  scopeKind: "occurrence",
  occurrenceKey: `delayed-task:${today}`,
  periodKey: null,
  periodStart: null,
  periodEnd: null
};

const completedRecord = {
  id: "delayed-record",
  taskId: task.id,
  status: "completed",
  title: task.title,
  taskActive: true,
  actualCompleter: { userId: user.id, displayName: user.displayName, avatarUrl: null },
  assignedUser: null,
  completedAt: `${today}T02:00:00.000Z`,
  skippedAt: null,
  targetDate: today,
  targetWeekStart: null,
  occurrenceKey: task.occurrenceKey,
  periodKey: null,
  createdAt: `${today}T02:00:00.000Z`,
  updatedAt: `${today}T02:00:00.000Z`
};

const homeData = (completed = false) => ({
  date: today,
  homeTasks: completed ? [] : [task],
  completedRecords: completed ? [completedRecord] : [],
  passedRecords: [],
  shopping: { pendingCount: 0 },
  members: []
});

const envelope = (data: unknown, status = 200) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify(status >= 400
    ? { ok: false, error: { code: "INTERNAL_ERROR", message: "refresh failed" }, requestId: "delayed-refresh" }
    : { ok: true, data, requestId: "delayed-refresh" })
});

const seedSnapshot = async (page: Page, data = homeData()) => {
  await page.addInitScript(({ nextData, identity }) => {
    const key = `home:${identity.userId}:${identity.householdId}:${nextData.date}`;
    const request = indexedDB.open("house-to-do-home-snapshots", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("home-snapshots", { keyPath: "key" });
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction("home-snapshots", "readwrite");
      transaction.objectStore("home-snapshots").put({
        key,
        schemaVersion: 1,
        ...identity,
        date: nextData.date,
        savedAt: Date.now(),
        data: nextData
      });
      transaction.oncomplete = () => database.close();
    };
  }, { nextData: data, identity: { userId: user.id, householdId: household.id } });
};

const installRoutes = async (page: Page, options: { homeDelayMs?: number; holdReconcile?: boolean } = {}) => {
  let completed = false;
  let homeCalls = 0;
  let releaseReconcile!: () => void;
  const reconcileGate = new Promise<void>((resolve) => { releaseReconcile = resolve; });

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/auth/me") return route.fulfill(envelope({ user }));
    if (url.pathname === "/api/households/current") return route.fulfill(envelope({ household }));
    if (url.pathname === "/api/home/today") {
      homeCalls += 1;
      if (options.homeDelayMs) await new Promise((resolve) => setTimeout(resolve, options.homeDelayMs));
      if (options.holdReconcile && homeCalls > 1) await reconcileGate;
      return route.fulfill(envelope(homeData(completed)));
    }
    if (url.pathname.match(/^\/api\/tasks\/[^/]+\/complete$/) && request.method() === "POST") {
      completed = true;
      return route.fulfill(envelope({ result: { status: "completed" } }));
    }
    if (url.pathname === "/api/tasks/calendar") return route.fulfill(envelope({
      from: today, to: today, today, timezone: household.timezone, dates: {}, selected: null
    }));
    return route.fulfill(envelope({}));
  });
  return { releaseReconcile, homeCalls: () => homeCalls };
};

test.use({ viewport: { width: 390, height: 844 }, locale: "ja-JP", timezoneId: "Asia/Tokyo" });

test.describe("Delayed Home background refresh status", () => {
  test("does not show text for a fast authoritative refresh", async ({ page }) => {
    await seedSnapshot(page);
    await installRoutes(page, { homeDelayMs: 100 });
    await page.goto("/home");
    await expect(page.getByText(task.title, { exact: true })).toBeVisible();
    await expect(page.getByText("最新情報を確認しています。", { exact: true })).toHaveCount(0);
    await page.waitForTimeout(250);
    await expect(page.getByText("最新情報を確認しています。", { exact: true })).toHaveCount(0);
    await page.screenshot({ path: path.join(artifactRoot, "01-fast-refresh-no-status-390x844.png"), fullPage: false });
  });

  test("shows a slow refresh after 500ms and keeps it for 400ms", async ({ page }) => {
    await seedSnapshot(page);
    const harness = await installRoutes(page, { holdReconcile: true });
    await page.goto("/home");
    await expect(page.getByText(task.title, { exact: true })).toBeVisible();
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect.poll(() => harness.homeCalls()).toBe(2);
    await page.waitForTimeout(250);
    await expect(page.getByText("最新情報を確認しています。", { exact: true })).toHaveCount(0);
    await page.waitForTimeout(300);
    await expect(page.getByText("最新情報を確認しています。", { exact: true })).toBeVisible();
    await page.screenshot({ path: path.join(artifactRoot, "02-slow-refresh-status-390x844.png"), fullPage: false });
    harness.releaseReconcile();
    await page.waitForTimeout(200);
    await expect(page.getByText("最新情報を確認しています。", { exact: true })).toBeVisible();
    await page.waitForTimeout(250);
    await expect(page.getByText("最新情報を確認しています。", { exact: true })).toHaveCount(0);
  });

  test("keeps Complete local-first and avoids a fast reconcile flash", async ({ page }) => {
    await installRoutes(page, { homeDelayMs: 100 });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/home");
    const row = page.locator(".m2-home__task-list .m2-home__row").filter({ hasText: task.title });
    await row.locator(".m2-home__row-main").click();
    const clickAt = Date.now();
    await row.getByRole("button", { name: "完了", exact: true }).click();
    await expect(page.getByRole("button", { name: /完了済み 1/ })).toBeVisible();
    expect(Date.now() - clickAt).toBeLessThan(1500);
    await expect(page.getByText("最新情報を確認しています。", { exact: true })).toHaveCount(0);
    await page.screenshot({ path: path.join(artifactRoot, "03-complete-local-first-375x812.png"), fullPage: false });
  });

  test("keeps Complete local-first while showing a deliberately slow reconcile", async ({ page }) => {
    const harness = await installRoutes(page, { holdReconcile: true });
    await page.goto("/home");
    const row = page.locator(".m2-home__task-list .m2-home__row").filter({ hasText: task.title });
    await row.locator(".m2-home__row-main").click();
    await row.getByRole("button", { name: "完了", exact: true }).click();
    await expect(page.getByRole("button", { name: /完了済み 1/ })).toBeVisible();
    await expect.poll(() => harness.homeCalls()).toBe(2);
    await page.waitForTimeout(550);
    await expect(page.getByText("最新情報を確認しています。", { exact: true })).toBeVisible();
    await expect(page.locator(".m2-home__task-list").getByText(task.title, { exact: true })).toHaveCount(0);
    harness.releaseReconcile();
  });
});
