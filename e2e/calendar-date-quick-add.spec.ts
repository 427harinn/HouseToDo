import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const date = "2026-09-04";
const evidenceDir = path.resolve("docs/evidence/calendar-date-quick-add");

const envelope = (data: unknown, status = 200) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify({ ok: true, data, requestId: "calendar-date-quick-add-e2e" })
});

const calendarTask = {
  id: "task-calendar-quick-add",
  title: "カレンダーから追加した家事",
  description: null,
  recurrenceType: "once",
  modelRecurrenceType: "once",
  assignmentType: "anyone",
  assignedUserId: null,
  assignment: { type: "anyone", user: null },
  scheduledTime: null,
  notificationSlot: "none",
  weekdays: [],
  weeklyTargetCount: null,
  startDate: date,
  targetDate: date,
  deadlineTime: null,
  notificationOffsetMinutes: null,
  active: true,
  sortOrder: 1,
  createdBy: "user-1",
  createdAt: "2026-09-04T00:00:00.000Z",
  updatedAt: "2026-09-04T00:00:00.000Z",
  status: "pending",
  actedBy: null,
  startedAt: null,
  completedAt: null,
  skippedAt: null,
  note: null,
  scopeKind: "occurrence",
  occurrenceKey: "occurrence:task-calendar-quick-add:2026-09-04",
  periodKey: null,
  periodStart: date,
  periodEnd: date,
  deadlineDate: date,
  overdue: false
};

const shoppingItem = {
  id: "shopping-calendar-quick-add",
  name: "カレンダーから追加した買い物",
  quantity: "1個",
  note: null,
  plannedPurchaseDate: date,
  status: "pending",
  addedBy: "user-1",
  purchasedBy: null,
  purchasedAt: null,
  sortOrder: 1,
  createdAt: "2026-09-04T00:00:00.000Z",
  updatedAt: "2026-09-04T00:00:00.000Z",
  image: null
};

const screenshot = async (page: Page, name: string) => {
  await mkdir(evidenceDir, { recursive: true });
  await page.screenshot({ path: path.join(evidenceDir, name), fullPage: false });
};

const installRoutes = async (page: Page) => {
  let taskAdded = false;
  let shoppingAdded = false;

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/auth/me") return route.fulfill(envelope({ user: { id: "user-1", email: "e2e@example.test", displayName: "はる" } }));
    if (url.pathname === "/api/households/current") return route.fulfill(envelope({ household: { id: "household-1", name: "わが家", timezone: "Asia/Tokyo", weekStartsOn: 1, role: "owner" } }));
    if (url.pathname === "/api/households/current/members") return route.fulfill(envelope({ members: [{ userId: "user-1", displayName: "はる", role: "owner", color: "#d9f2eb", avatarUrl: null }] }));
    if (url.pathname === "/api/households/current/image-usage") return route.fulfill(envelope({ activeCount: 0, activeCountLimit: 10, activeBytes: 0, activeBytesLimit: 52428800, storedBytes: 0, storedBytesLimit: 78643200, dailyUploadCount: 0, dailyUploadLimit: 20 }));
    if (url.pathname === "/api/tasks/recent") return route.fulfill(envelope({ tasks: [] }));
    if (url.pathname === "/api/shopping/recent") return route.fulfill(envelope({ items: [] }));
    if (url.pathname === "/api/shopping/templates") return route.fulfill(envelope({ templates: [] }));
    if (url.pathname === "/api/tasks" && request.method() === "POST") {
      expect(request.postDataJSON()).toMatchObject({ modelRecurrenceType: "once", recurrenceType: "once", startDate: date, targetDate: date });
      taskAdded = true;
      return route.fulfill(envelope({ task: calendarTask }, 201));
    }
    if (url.pathname === "/api/shopping/items" && request.method() === "POST") {
      expect(request.postDataJSON()).toMatchObject({ plannedPurchaseDate: date });
      shoppingAdded = true;
      return route.fulfill(envelope({ item: shoppingItem }, 201));
    }
    if (url.pathname === "/api/tasks/calendar/range") {
      return route.fulfill(envelope({
        from: "2026-08-30",
        to: "2026-10-10",
        today: date,
        timezone: "Asia/Tokyo",
        dates: {
          [date]: {
            fixedCount: taskAdded ? 1 : 0,
            fixedCompletedCount: 0,
            fixedSkippedCount: 0,
            shoppingCount: shoppingAdded ? 1 : 0,
            purchasedShoppingCount: 0,
            tasks: taskAdded ? [{ id: calendarTask.id, title: calendarTask.title, deadline: false }] : []
          }
        }
      }));
    }
    if (url.pathname === "/api/tasks/calendar/day") {
      return route.fulfill(envelope({
        today: date,
        timezone: "Asia/Tokyo",
        selectedDate: url.searchParams.get("date") ?? date,
        selected: {
          fixed: taskAdded ? [calendarTask] : [],
          weeklyFlexible: [],
          monthlyFlexible: [],
          completed: [],
          shopping: shoppingAdded ? [shoppingItem] : []
        }
      }));
    }
    throw new Error(`Unexpected quick-add API request: ${request.method()} ${url.pathname}`);
  });
};

const openQuickAddMenu = async (page: Page) => {
  await page.getByRole("button", { name: "この日に追加" }).click();
  await expect(page.getByRole("menu", { name: "この日に追加" })).toBeVisible();
};

test.describe("Calendar date quick add", () => {
  test("adds a task and shopping item with the selected date and returns to the open Date Sheet", async ({ page }) => {
    await page.clock.install({ time: new Date("2026-09-04T12:00:00+09:00") });
    await installRoutes(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/calendar?date=${date}`);
    await expect(page.getByRole("dialog", { name: /9月4日/ })).toBeVisible();
    await screenshot(page, "01-date-detail-plus.png");

    await openQuickAddMenu(page);
    await screenshot(page, "02-quick-add-menu.png");
    await page.getByRole("button", { name: "この日に追加" }).click();
    await expect(page.getByRole("menu")).toHaveCount(0);
    await openQuickAddMenu(page);
    await page.getByRole("menuitem", { name: "家事を追加" }).click();
    await expect(page).toHaveURL(/\/tasks\/new\?returnTo=%2Fcalendar%3Fdate%3D2026-09-04&date=2026-09-04&origin=calendar&calendarDate=2026-09-04/);
    await expect(page.getByRole("heading", { name: "家事を追加" })).toBeVisible();
    await expect(page.locator("#m2-task-start-date")).toHaveValue(date);
    await expect(page.getByRole("button", { name: "繰り返し: 今回だけ" })).toBeVisible();
    await screenshot(page, "03-task-form-selected-date.png");

    await page.getByLabel("家事名").fill("カレンダーから追加した家事");
    await page.getByRole("button", { name: "保存" }).click();
    await expect(page).toHaveURL(new RegExp(`/calendar\\?date=${date}$`));
    await expect(page.getByRole("dialog", { name: /9月4日/ })).toBeVisible();
    await expect(page.getByRole("dialog").getByRole("button", { name: `${calendarTask.title}の詳細` })).toBeVisible();
    await screenshot(page, "04-task-saved-calendar-date.png");

    await openQuickAddMenu(page);
    await page.getByRole("menuitem", { name: "買い物を追加" }).click();
    await expect(page).toHaveURL(/\/shopping\/new\?returnTo=%2Fcalendar%3Fdate%3D2026-09-04&date=2026-09-04&origin=calendar&calendarDate=2026-09-04/);
    await expect(page.getByRole("heading", { name: "買い物を追加" })).toBeVisible();
    await expect(page.locator("#shopping-planned-purchase-date")).toHaveValue(date);
    await screenshot(page, "05-shopping-form-selected-date.png");

    await page.getByLabel("商品名").fill("カレンダーから追加した買い物");
    await page.getByRole("button", { name: "保存" }).click();
    await expect(page).toHaveURL(new RegExp(`/calendar\\?date=${date}$`));
    await expect(page.getByRole("dialog", { name: /9月4日/ })).toBeVisible();
    await expect(page.getByRole("dialog").getByRole("button", { name: shoppingItem.name })).toBeVisible();
    await screenshot(page, "06-shopping-saved-calendar-date.png");
  });

  test("closes the lightweight menu on outside tap and resets it when the date changes", async ({ page }) => {
    await page.clock.install({ time: new Date("2026-09-04T12:00:00+09:00") });
    await installRoutes(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/calendar?date=${date}`);
    await openQuickAddMenu(page);
    await page.getByRole("heading", { name: "9月4日 金曜日" }).click();
    await expect(page.getByRole("menu")).toHaveCount(0);
    await openQuickAddMenu(page);
    await page.getByRole("button", { name: "次の日" }).click();
    await expect(page.getByRole("heading", { name: "9月5日 土曜日" })).toBeVisible();
    await expect(page.getByRole("menu")).toHaveCount(0);
  });
});
