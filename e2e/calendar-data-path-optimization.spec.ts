import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const artifactDir = path.resolve(process.env.PLAYWRIGHT_ARTIFACT_DIR ?? "artifacts/playwright/calendar-data-path-optimization");
const password = "very-long-password";
const response = (data: unknown) => ({ ok: true, data, requestId: "e2e-calendar-data-path" });

const calendarTask = (id: string, title: string, selectedDate: string) => ({
  id,
  title,
  description: null,
  recurrenceType: "model_only",
  modelRecurrenceType: "once",
  assignmentType: "anyone",
  assignedUserId: null,
  assignment: { type: "anyone", user: null },
  scheduledTime: null,
  notificationSlot: "none",
  weekdays: [],
  weeklyTargetCount: null,
  targetDate: selectedDate,
  active: true,
  sortOrder: 1,
  createdBy: "user-1",
  createdAt: "2026-08-01",
  updatedAt: "2026-08-01",
  status: "pending",
  actedBy: null,
  startedAt: null,
  completedAt: null,
  skippedAt: null,
  note: null,
  scopeKind: "occurrence",
  occurrenceKey: `occurrence:${id}:${selectedDate}`,
  periodKey: null,
  periodStart: selectedDate,
  periodEnd: selectedDate,
  deadlineDate: selectedDate,
  overdue: false
});

const dateKey = () => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};
const addDays = (value: string, amount: number) => {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
};
const label = (value: string) => `${Number(value.slice(5, 7))}月${Number(value.slice(8, 10))}日`;
const shot = async (page: Page, name: string) => {
  await mkdir(artifactDir, { recursive: true });
  await page.screenshot({ path: path.join(artifactDir, name), fullPage: true });
};
const cell = (page: Page, date: string) => page.locator(`.calendar-day-cell[aria-label^="${label(date)}"]`);
const waitForCount = async (requests: string[], predicate: (url: URL) => boolean, count: number) => {
  await expect.poll(() => requests.filter((value) => predicate(new URL(value))).length).toBe(count);
};
const swipeLeft = async (page: Page, row: ReturnType<Page["locator"]>) => {
  const box = await row.boundingBox();
  if (!box) throw new Error("Calendar row is not measurable.");
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
};

test("optimizes Calendar marker/detail paths, actions, stale responses, and screenshots", async ({ page }) => {
  const today = dateKey();
  const tomorrow = addDays(today, 1);
  const day3 = addDays(today, 2);
  const staleFirst = addDays(today, 3);
  const staleSecond = addDays(today, 4);
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const dailyTitle = `WP6 daily ${id}`;
  const passTitle = `WP6 pass ${id}`;
  const weeklyFixedTitle = `WP6 weekly fixed ${id}`;
  const shoppingTitle = `WP6 shopping ${id}`;
  const requests: string[] = [];
  const actionRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/tasks/calendar")) requests.push(request.url());
    if (/[\/]complete$|[\/]skip$|[\/]calendar-restore$/.test(new URL(request.url()).pathname)) actionRequests.push(request.url());
  });

  await page.clock.install({ time: new Date(`${today}T12:00:00+09:00`) });
  await page.goto("/register");
  await page.locator("#register-name").fill(`WP6 Calendar ${id}`);
  await page.locator("#register-email").fill(`wp6-calendar-${id}@example.test`);
  await page.locator("#register-password").fill(password);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/household\/create|\/home/);
  await page.goto("/household/create");
  await page.locator("#household-name").fill(`WP6 Calendar House ${id}`);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/home/);

  const origin = { origin: new URL(page.url()).origin };
  const createTask = async (input: Record<string, unknown>) => {
    const response = await page.request.post("/api/tasks", {
      headers: origin,
      data: { assignmentType: "anyone", notificationSlot: "none", startDate: today, ...input }
    });
    expect(response.status()).toBe(201);
  };
  await createTask({ title: dailyTitle, modelRecurrenceType: "daily" });
  await createTask({ title: passTitle, modelRecurrenceType: "daily" });
  await createTask({ title: weeklyFixedTitle, modelRecurrenceType: "weekly_fixed", weekdays: [new Date(`${today}T00:00:00Z`).getUTCDay()] });
  await createTask({ title: `WP6 monthly fixed ${id}`, modelRecurrenceType: "monthly_fixed", monthlyDayOfMonth: Number(today.slice(8, 10)) });
  await createTask({ title: `WP6 weekly flexible ${id}`, modelRecurrenceType: "weekly_flexible", weeklyDeadlineWeekday: new Date(`${today}T00:00:00Z`).getUTCDay() });
  await createTask({ title: `WP6 monthly flexible ${id}`, modelRecurrenceType: "monthly_flexible", monthlyDeadlineType: "month_end" });
  const shopping = await page.request.post("/api/shopping/items", { headers: origin, data: { name: shoppingTitle, quantity: "1個", plannedPurchaseDate: today } });
  expect(shopping.status()).toBe(201);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/calendar");
  await expect(page.getByRole("grid", { name: /カレンダー/ })).toBeVisible();
  await waitForCount(requests, (url) => url.pathname.endsWith("/calendar/range"), 1);
  await expect(page.locator(".calendar-day-cell")).toHaveCount(42);
  await expect(page.locator(".calendar-day-task").filter({ hasText: weeklyFixedTitle }).first()).toBeVisible();
  await shot(page, "01-calendar-month-390x844.png");

  await cell(page, today).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await waitForCount(requests, (url) => url.pathname.endsWith("/calendar/day"), 1);
  await expect(page.getByText(dailyTitle).first()).toBeVisible();
  await shot(page, "02-date-sheet-selected-390x844.png");
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await cell(page, tomorrow).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await waitForCount(requests, (url) => url.pathname.endsWith("/calendar/day"), 2);
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await cell(page, day3).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await waitForCount(requests, (url) => url.pathname.endsWith("/calendar/day"), 3);
  await expect(page.getByRole("heading", { name: new RegExp(label(day3)) })).toBeVisible();
  await waitForCount(requests, (url) => url.pathname.endsWith("/calendar/range"), 1);
  await shot(page, "03-date-sheet-same-month-390x844.png");

  let releaseFirst: (() => void) | null = null;
  let delayFirst = true;
  await page.route("**/api/tasks/calendar/day**", async (route) => {
    if (!delayFirst) return route.continue();
    delayFirst = false;
    const response = await route.fetch();
    const body = await response.body();
    await new Promise<void>((resolve) => { releaseFirst = resolve; });
    await route.fulfill({ response, body });
  });
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await cell(page, staleFirst).click();
  await page.getByRole("dialog").getByRole("button", { name: "次の日" }).click();
  await expect(page.getByRole("heading", { name: new RegExp(label(staleSecond)) })).toBeVisible();
  releaseFirst?.();
  await page.waitForTimeout(80);
  await expect(page.getByRole("heading", { name: new RegExp(label(staleSecond)) })).toBeVisible();
  await page.unroute("**/api/tasks/calendar/day**");
  await page.getByRole("button", { name: "閉じる", exact: true }).click();

  await page.getByRole("button", { name: "次の月" }).click();
  await expect(page.getByRole("heading", { name: /年.*月/ })).toBeVisible();
  await waitForCount(requests, (url) => url.pathname.endsWith("/calendar/range"), 2);
  await page.getByRole("button", { name: "今日", exact: true }).click();
  await cell(page, today).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText(dailyTitle).first()).toBeVisible();
  const rangeBeforeComplete = requests.filter((value) => new URL(value).pathname.endsWith("/calendar/range")).length;
  const dayBeforeComplete = requests.filter((value) => new URL(value).pathname.endsWith("/calendar/day")).length;
  const dailyRow = page.locator(".calendar-detail-task").filter({ hasText: dailyTitle }).first();
  await dailyRow.locator(".calendar-detail-task__main").click();
  await dailyRow.getByRole("button", { name: "完了" }).click();
  await expect(page.getByRole("button", { name: /完了済み 1/ })).toBeVisible({ timeout: 3_000 });
  await waitForCount(requests, (url) => url.pathname.endsWith("/calendar/range"), rangeBeforeComplete + 1);
  await waitForCount(requests, (url) => url.pathname.endsWith("/calendar/day"), dayBeforeComplete + 1);
  await shot(page, "04-completed-task-390x844.png");

  await page.getByRole("button", { name: /完了済み 1/ }).click();
  const completedRow = page.locator(".calendar-history-row").first();
  await swipeLeft(page, completedRow);
  await completedRow.getByRole("button", { name: "戻す", exact: true }).click();
  await expect(page.locator(".calendar-detail-task").filter({ hasText: dailyTitle })).toHaveCount(1, { timeout: 3_000 });
  await waitForCount(requests, (url) => url.pathname.endsWith("/calendar/range"), rangeBeforeComplete + 2);
  await expect(page.locator(".calendar-detail-task").filter({ hasText: dailyTitle })).not.toHaveClass(/is-restoring/);
  await shot(page, "05-restored-task-390x844.png");
  await expect(page.getByRole("button", { name: new RegExp(shoppingTitle) })).toBeVisible();
  await shot(page, "06-shopping-date-sheet-390x844.png");
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await cell(page, today).click();
  const passRow390 = page.locator(".calendar-detail-task").filter({ hasText: passTitle }).first();
  await swipeLeft(page, passRow390);
  await passRow390.getByRole("button", { name: "パス", exact: true }).click();
  await expect(page.locator(".calendar-detail-task").filter({ hasText: passTitle })).toHaveCount(0, { timeout: 3_000 });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/calendar");
  await expect(page.getByRole("grid", { name: /カレンダー/ })).toBeVisible();
  await waitForCount(requests, (url) => url.pathname.endsWith("/calendar/range"), rangeBeforeComplete + 4);
  await expect(page.locator(".calendar-day-task").filter({ hasText: weeklyFixedTitle }).first()).toBeVisible();
  await shot(page, "01-calendar-month-375x812.png");
  await cell(page, today).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("button", { name: new RegExp(shoppingTitle) })).toBeVisible();
  await shot(page, "02-date-sheet-selected-375x812.png");
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await cell(page, tomorrow).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await shot(page, "03-date-sheet-same-month-375x812.png");
  const dailyRow375 = page.locator(".calendar-detail-task").filter({ hasText: dailyTitle }).first();
  await dailyRow375.locator(".calendar-detail-task__main").click();
  await dailyRow375.getByRole("button", { name: "完了" }).click();
  await expect(page.getByRole("button", { name: /完了済み/ })).toBeVisible({ timeout: 3_000 });
  await shot(page, "04-completed-task-375x812.png");
  await page.getByRole("button", { name: /完了済み/ }).first().click();
  const restoredAgain = page.locator(".calendar-history-row").filter({ hasText: dailyTitle }).first();
  await swipeLeft(page, restoredAgain);
  await restoredAgain.getByRole("button", { name: "戻す", exact: true }).click();
  await expect(page.locator(".calendar-detail-task").filter({ hasText: dailyTitle })).toHaveCount(1, { timeout: 3_000 });
  await expect(page.locator(".calendar-detail-task").filter({ hasText: dailyTitle })).not.toHaveClass(/is-restoring/);
  await shot(page, "05-restored-task-375x812.png");
  await expect(page.getByText(dailyTitle).first()).toBeVisible();
  await shot(page, "06-shopping-date-sheet-375x812.png");

  const markerRequests = requests.filter((value) => new URL(value).pathname.endsWith("/calendar/range"));
  const selectedRequests = requests.filter((value) => new URL(value).pathname.endsWith("/calendar/day"));
  console.log(JSON.stringify({ markerRequests: markerRequests.length, selectedRequests: selectedRequests.length, mutationPosts: actionRequests.length }));
  expect(markerRequests.length).toBeGreaterThanOrEqual(5);
  expect(selectedRequests.length).toBeGreaterThanOrEqual(8);
  expect(actionRequests.filter((value) => new URL(value).pathname.endsWith("/complete")).length).toBe(2);
  expect(actionRequests.filter((value) => new URL(value).pathname.endsWith("/skip")).length).toBe(1);
  expect(actionRequests.filter((value) => new URL(value).pathname.endsWith("/calendar-restore")).length).toBe(2);
});

test("does not show false empty state while selected date data is delayed", async ({ page }) => {
  const today = dateKey();
  const taskDate = today;
  const emptyDate = addDays(today, 1);
  const nextTaskDate = addDays(today, 2);
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const taskTitle = `Calendar transition task A ${id}`;
  const nextTaskTitle = `Calendar transition task C ${id}`;
  const delayedDates = new Set<string>();
  const pendingReleases = new Map<string, Array<() => void>>();
  const releaseNext = (date: string) => {
    const resolve = pendingReleases.get(date)?.shift();
    resolve?.();
  };
  const waitForRelease = (date: string) => new Promise<void>((resolve) => {
    const releases = pendingReleases.get(date) ?? [];
    releases.push(resolve);
    pendingReleases.set(date, releases);
  });
  const selectedFor = (date: string) => ({
    fixed: date === taskDate ? [calendarTask("transition-task-a", taskTitle, date)] : date === nextTaskDate ? [calendarTask("transition-task-c", nextTaskTitle, date)] : [],
    weeklyFlexible: [],
    monthlyFlexible: [],
    completed: [],
    shopping: []
  });
  const markerFor = (date: string) => ({ fixedCount: date === taskDate || date === nextTaskDate ? 1 : 0, fixedCompletedCount: 0, fixedSkippedCount: 0, shoppingCount: 0, purchasedShoppingCount: 0, tasks: date === taskDate ? [{ id: "transition-task-a", title: taskTitle, deadline: false }] : date === nextTaskDate ? [{ id: "transition-task-c", title: nextTaskTitle, deadline: false }] : [] });
  const rangeDates = Object.fromEntries(Array.from({ length: 42 }, (_, index) => {
    const date = addDays(today, index - 7);
    return [date, markerFor(date)];
  }));

  await page.clock.install({ time: new Date(`${today}T12:00:00+09:00`) });
  await page.goto("/register");
  await page.locator("#register-name").fill(`Calendar transition ${id}`);
  await page.locator("#register-email").fill(`calendar-transition-${id}@example.test`);
  await page.locator("#register-password").fill(password);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/household\/create|\/home/);
  await page.goto("/household/create");
  await page.locator("#household-name").fill(`Calendar transition house ${id}`);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/home/);

  await page.route("**/api/tasks/calendar/range**", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(response({ from: addDays(today, -7), to: addDays(today, 34), today, timezone: "Asia/Tokyo", dates: rangeDates })) }));
  await page.route("**/api/tasks/calendar/day**", async (route) => {
    const date = new URL(route.request().url()).searchParams.get("date") ?? today;
    if (delayedDates.has(date)) await waitForRelease(date);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(response({ today, timezone: "Asia/Tokyo", selectedDate: date, selected: selectedFor(date) })) });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/calendar?date=${taskDate}`);
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText(taskTitle).first()).toBeVisible();

  delayedDates.add(emptyDate);
  await page.getByRole("button", { name: "次の日" }).click();
  await expect(page.getByRole("heading", { name: new RegExp(label(emptyDate)) })).toBeVisible();
  await expect(sheet.getByText(taskTitle)).toHaveCount(0);
  await expect(sheet.getByText("なし")).toHaveCount(0);
  await shot(page, "07-delayed-task-to-empty-390x844.png");
  releaseNext(emptyDate);
  await expect(sheet.getByText("なし")).toHaveCount(2);
  await shot(page, "08-true-empty-day-390x844.png");

  delayedDates.add(nextTaskDate);
  await page.getByRole("button", { name: "次の日" }).click();
  await expect(page.getByRole("heading", { name: new RegExp(label(nextTaskDate)) })).toBeVisible();
  await expect(sheet.getByText(nextTaskTitle).first()).toBeVisible();
  await expect(sheet.getByText("なし")).toHaveCount(1);
  await expect(sheet.getByText(taskTitle)).toHaveCount(0);
  await shot(page, "09-delayed-empty-to-task-390x844.png");
  releaseNext(nextTaskDate);
  await expect(sheet.getByText(nextTaskTitle).first()).toBeVisible();
  await shot(page, "10-task-day-loaded-390x844.png");

  delayedDates.clear();
  await page.goto(`/calendar?date=${taskDate}`);
  await expect(sheet.getByText(taskTitle).first()).toBeVisible();
  delayedDates.add(emptyDate);
  delayedDates.add(nextTaskDate);
  await page.getByRole("button", { name: "次の日" }).click();
  await expect(page.getByRole("heading", { name: new RegExp(label(emptyDate)) })).toBeVisible();
  await page.getByRole("button", { name: "次の日" }).click();
  await expect(page.getByRole("heading", { name: new RegExp(label(nextTaskDate)) })).toBeVisible();
  releaseNext(nextTaskDate);
  await expect(sheet.getByText(nextTaskTitle).first()).toBeVisible();
  releaseNext(emptyDate);
  await page.waitForTimeout(80);
  await expect(page.getByRole("heading", { name: new RegExp(label(nextTaskDate)) })).toBeVisible();
  await expect(sheet.getByText(nextTaskTitle).first()).toBeVisible();

  await page.setViewportSize({ width: 375, height: 812 });
  delayedDates.clear();
  await page.goto(`/calendar?date=${emptyDate}`);
  await expect(sheet.getByText("なし")).toHaveCount(2);
  await shot(page, "07-true-empty-day-375x812.png");
  delayedDates.add(nextTaskDate);
  await page.getByRole("button", { name: "次の日" }).click();
  await expect(page.getByRole("heading", { name: new RegExp(label(nextTaskDate)) })).toBeVisible();
  await expect(sheet.getByText("なし")).toHaveCount(0);
  await shot(page, "08-delayed-empty-to-task-375x812.png");
  releaseNext(nextTaskDate);
  await expect(sheet.getByText(nextTaskTitle).first()).toBeVisible();
  await shot(page, "09-task-day-loaded-375x812.png");
});
