import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const artifactRoot = process.env.PLAYWRIGHT_ARTIFACT_DIR ?? "artifacts/playwright/calendar-cache-first";
const today = "2026-09-02";
const gridFrom = "2026-08-30";
const gridTo = "2026-10-10";
const timezone = "Asia/Tokyo";
const user = { id: "cache-user", email: "cache@example.test", displayName: "Cache User" };
const household = { id: "cache-household", name: "Cache House", timezone, weekStartsOn: 1, role: "owner" };
const envelope = (data: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(status >= 400 ? { ok: false, error: { code: "INTERNAL_ERROR", message: "error" }, requestId: "cache-first" } : { ok: true, data, requestId: "cache-first" }) });
const addDays = (value: string, amount: number) => { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + amount); return date.toISOString().slice(0, 10); };
const marker = (title = "キャッシュマーカー") => ({ fixedCount: title ? 1 : 0, fixedCompletedCount: 0, fixedSkippedCount: 0, shoppingCount: 0, purchasedShoppingCount: 0, tasks: title ? [{ id: "cache-task", title, deadline: false }] : [] });
const rangeData = (title = "キャッシュマーカー") => ({ from: gridFrom, to: gridTo, today, timezone, dates: { [today]: marker(title) } });
const task = (date: string, title = "キャッシュタスク") => ({ id: `task-${date}`, title, description: null, recurrenceType: "model_only", modelRecurrenceType: "once", assignmentType: "anyone", assignedUserId: null, assignment: { type: "anyone", user: null }, scheduledTime: null, notificationSlot: "none", weekdays: [], weeklyTargetCount: null, targetDate: date, active: true, sortOrder: 1, createdBy: user.id, createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z", status: "pending", actedBy: null, startedAt: null, completedAt: null, skippedAt: null, note: null, scopeKind: "occurrence", occurrenceKey: `occurrence:${date}`, periodKey: null, periodStart: date, periodEnd: date, deadlineDate: date, overdue: false });
const dayData = (date: string, title: string | null = "キャッシュタスク") => ({ today, timezone, selectedDate: date, selected: { fixed: title ? [task(date, title)] : [], weeklyFlexible: [], monthlyFlexible: [], completed: [], shopping: [] } });
const screenshot = async (page: Page, name: string) => { await mkdir(artifactRoot, { recursive: true }); await page.screenshot({ path: path.resolve(artifactRoot, name), fullPage: true }); };

const seedIndexedDb = async (page: Page, records: { ranges?: unknown[]; days?: unknown[] }) => {
  await page.addInitScript(({ ranges, days }) => {
    const request = indexedDB.open("house-to-do-calendar-snapshots", 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("calendar-ranges")) database.createObjectStore("calendar-ranges", { keyPath: "key" });
      if (!database.objectStoreNames.contains("calendar-days")) database.createObjectStore("calendar-days", { keyPath: "key" });
    };
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction(["calendar-ranges", "calendar-days"], "readwrite");
      ranges.forEach((record) => transaction.objectStore("calendar-ranges").put(record));
      days.forEach((record) => transaction.objectStore("calendar-days").put(record));
      transaction.oncomplete = () => database.close();
    };
  }, records);
};

const installRoutes = async (page: Page, options: { range?: unknown; day?: (date: string) => unknown; holdRange?: boolean; holdDay?: Set<string>; householdData?: typeof household } = {}) => {
  let releaseRange!: () => void;
  const rangeHeld = new Promise<void>((resolve) => { releaseRange = resolve; });
  const releases = new Map<string, () => void>();
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/auth/me") return route.fulfill(envelope({ user }));
    if (url.pathname === "/api/households/current") return route.fulfill(envelope({ household: options.householdData ?? household }));
    if (url.pathname === "/api/tasks/calendar/range") {
      if (options.holdRange) await rangeHeld;
      return route.fulfill(envelope(options.range ?? rangeData()));
    }
    if (url.pathname === "/api/tasks/calendar/day") {
      const date = url.searchParams.get("date") ?? today;
      if (options.holdDay?.has(date)) {
        await new Promise<void>((resolve) => releases.set(date, resolve));
      }
      return route.fulfill(envelope(options.day?.(date) ?? dayData(date)));
    }
    if (url.pathname === "/api/home/today") return route.fulfill(envelope({ date: today, homeTasks: [], completedRecords: [], passedRecords: [], shopping: { pendingCount: 0 }, members: [] }));
    return route.fulfill(envelope({}));
  });
  return { releaseRange, releaseDay: (date: string) => releases.get(date)?.() };
};

const dayRecord = (date: string, data: unknown, householdId = household.id) => ({ key: `calendar-day:${user.id}:${householdId}:${timezone}:${date}`, schemaVersion: 1, userId: user.id, householdId, timezone, selectedDate: date, savedAt: Date.now(), writeSequence: 1, data });
const rangeRecord = (data: unknown, householdId = household.id) => ({ key: `calendar-range:${user.id}:${householdId}:${timezone}:${gridFrom}:${gridTo}`, schemaVersion: 1, userId: user.id, householdId, timezone, from: gridFrom, to: gridTo, savedAt: Date.now(), writeSequence: 1, data });

test.describe("Calendar C5 cache-first", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: new Date("2026-09-02T12:00:00+09:00") });
    await page.setViewportSize({ width: 390, height: 844 });
  });

  test("cold Calendar GET populates separate server-confirmed range and day stores", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (request) => { if (request.url().includes("/api/tasks/calendar/")) requests.push(new URL(request.url()).pathname); });
    await installRoutes(page);
    const startedAt = Date.now();
    await page.goto(`/calendar?date=${today}`);
    await expect(page.getByRole("grid", { name: /カレンダー/ })).toBeVisible();
    await expect(page.getByText("キャッシュタスク").first()).toBeVisible();
    console.log(`[C5 timing][controlled local] cold Calendar DOM=${Date.now() - startedAt}ms`);
    await expect.poll(() => page.evaluate(async () => new Promise<number>((resolve) => { const request = indexedDB.open("house-to-do-calendar-snapshots", 1); request.onsuccess = () => { const database = request.result; const transaction = database.transaction(["calendar-ranges", "calendar-days"], "readonly"); let count = 0; transaction.objectStore("calendar-ranges").getAll().onsuccess = (event) => { count += (event.target as IDBRequest).result.length; }; transaction.objectStore("calendar-days").getAll().onsuccess = (event) => { count += (event.target as IDBRequest).result.length; }; transaction.oncomplete = () => { database.close(); resolve(count); }; }; }))).toBe(2);
    expect(requests).toEqual(expect.arrayContaining(["/api/tasks/calendar/range", "/api/tasks/calendar/day"]));
  });

  test("reuses memory range and day data before held revalidation", async ({ page }) => {
    let rangeCalls = 0;
    let dayCalls = 0;
    let releaseRange!: () => void;
    const heldRange = new Promise<void>((resolve) => { releaseRange = resolve; });
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      if (!url.pathname.startsWith("/api/")) return route.continue();
      if (url.pathname === "/api/auth/me") return route.fulfill(envelope({ user }));
      if (url.pathname === "/api/households/current") return route.fulfill(envelope({ household }));
      if (url.pathname === "/api/tasks/calendar/range") { rangeCalls += 1; if (rangeCalls === 2) await heldRange; return route.fulfill(envelope(rangeData("メモリマーカー"))); }
      if (url.pathname === "/api/tasks/calendar/day") { dayCalls += 1; return route.fulfill(envelope(dayData(today, "メモリタスク"))); }
      if (url.pathname === "/api/home/today") return route.fulfill(envelope({ date: today, homeTasks: [], completedRecords: [], passedRecords: [], shopping: { pendingCount: 0 }, members: [] }));
      return route.fulfill(envelope({}));
    });
    await page.goto(`/calendar?date=${today}`);
    await expect(page.getByText("メモリマーカー").first()).toBeVisible();
    await page.goto("/home");
    const revisitStartedAt = Date.now();
    await page.goto("/calendar");
    await expect(page.getByText("メモリマーカー").first()).toBeVisible();
    console.log(`[C5 timing][controlled local] memory range DOM=${Date.now() - revisitStartedAt}ms while revalidation held`);
    expect(rangeCalls).toBe(2);
    releaseRange();
    await expect.poll(() => dayCalls).toBeGreaterThanOrEqual(1);
  });

  test("reuses Date A memory after Date B and keeps B network responses from replacing A", async ({ page }) => {
    const dateA = today;
    const dateB = addDays(today, 1);
    const held = new Set<string>([dateB]);
    const routes = await installRoutes(page, { holdDay: held, day: (date) => dayData(date, date === dateA ? "Date A cache" : "Date B latest") });
    await page.goto(`/calendar?date=${dateA}`);
    await expect(page.getByText("Date A cache").first()).toBeVisible();
    await page.getByRole("button", { name: "次の日" }).click();
    await expect(page.getByRole("heading", { name: /9月3日/ })).toBeVisible();
    await expect(page.getByText("Date A cache")).toHaveCount(0);
    await page.getByRole("button", { name: "前の日" }).click();
    await expect(page.getByText("Date A cache").first()).toBeVisible();
    console.log("[C5 timing][controlled local] memory day DOM visible before held Date B response");
    await screenshot(page, "02-date-a-memory-before-held-network-390x844.png");
    routes.releaseDay(dateB);
    await expect(page.getByRole("heading", { name: /9月2日/ })).toBeVisible();
  });

  test("shows IndexedDB range and day cache before held network after reload", async ({ page }) => {
    await seedIndexedDb(page, { ranges: [rangeRecord(rangeData("IDBマーカー"))], days: [dayRecord(today, dayData(today, "IDBタスク"))] });
    const routes = await installRoutes(page, { holdRange: true, holdDay: new Set([today]), range: rangeData("サーバー最新"), day: () => dayData(today, "サーバー最新タスク") });
    await page.goto(`/calendar?date=${today}`);
    const idbStartedAt = Date.now();
    await expect(page.getByText("IDBマーカー").first()).toBeVisible();
    await expect(page.getByText("IDBタスク").first()).toBeVisible();
    console.log(`[C5 timing][controlled local] IndexedDB range/day DOM=${Date.now() - idbStartedAt}ms while GETs held`);
    await screenshot(page, "01-idb-cache-visible-390x844.png");
    routes.releaseRange(); routes.releaseDay(today);
    await expect(page.getByText("サーバー最新タスク").first()).toBeVisible();
    console.log(`[C5 timing][controlled local] authoritative replacement=${Date.now() - idbStartedAt}ms`);
    await screenshot(page, "05-authoritative-refreshed-390x844.png");
    await page.setViewportSize({ width: 375, height: 812 });
    await screenshot(page, "05-authoritative-refreshed-375x812.png");
  });

  test("distinguishes cached true-empty from no-cache pending and locks mutations until day sync", async ({ page }) => {
    const pendingDate = addDays(today, 2);
    await seedIndexedDb(page, { ranges: [rangeRecord(rangeData())], days: [dayRecord(today, dayData(today, null))] });
    const cached = await installRoutes(page, { holdDay: new Set([today, pendingDate]), day: (date) => dayData(date, null) });
    await page.goto(`/calendar?date=${today}`);
    await expect(page.getByText("なし")).toHaveCount(2);
    await screenshot(page, "03-cached-true-empty-390x844.png");
    await page.setViewportSize({ width: 375, height: 812 });
    await screenshot(page, "03-cached-true-empty-375x812.png");
    cached.releaseDay(today);

    await page.goto(`/calendar?date=${pendingDate}`);
    await expect(page.getByText("なし")).toHaveCount(0);
    await screenshot(page, "04-no-cache-pending-no-false-empty-375x812.png");
    await page.setViewportSize({ width: 390, height: 844 });
    await screenshot(page, "04-no-cache-pending-no-false-empty-390x844.png");
    cached.releaseDay(pendingDate);
    await expect(page.getByText("なし")).toHaveCount(2);
    await screenshot(page, "06-no-cache-authoritative-empty-390x844.png");
    await expect(page.getByRole("grid", { name: /カレンダー/ })).toBeVisible();
  });

  test("disables Complete, Pass, and Restore for cached data until authoritative day response", async ({ page }) => {
    await seedIndexedDb(page, { ranges: [rangeRecord(rangeData())], days: [dayRecord(today, dayData(today, "ロック対象"))] });
    const routes = await installRoutes(page, { holdDay: new Set([today]), day: () => dayData(today, "サーバー後") });
    await page.goto(`/calendar?date=${today}`);
    await page.getByRole("button", { name: "ロック対象の詳細" }).click();
    await expect(page.getByRole("button", { name: "完了" })).toBeDisabled();
    routes.releaseDay(today);
    await expect(page.getByText("サーバー後").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "完了" })).toBeEnabled();
  });

  test("does not show another household's persistent Calendar cache", async ({ page }) => {
    await seedIndexedDb(page, { ranges: [rangeRecord(rangeData("漏えいキャッシュ"), "old-household")], days: [] });
    await installRoutes(page, { range: rangeData("現在の家庭") });
    await page.goto("/calendar");
    await expect(page.getByText("漏えいキャッシュ")).toHaveCount(0);
    await expect(page.getByText("現在の家庭").first()).toBeVisible();
  });
});
