import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { mkdir, readFile } from "node:fs/promises";

const screenshotRoot = path.resolve("docs/screenshots/account-notifications");
const fixture = (name: string) => path.resolve("e2e/fixtures", name);

const user = {
  id: "user-1",
  email: "e2e@example.test",
  displayName: "E2E User",
  avatarUrl: null
};

const household = {
  id: "household-1",
  name: "E2E household",
  timezone: "Asia/Tokyo",
  weekStartsOn: 1,
  role: "owner"
};

const task = {
  id: "task-1",
  title: "キッチンを片付ける",
  description: "完了後も元のタスク設定を編集できます。",
  recurrenceType: "daily",
  modelRecurrenceType: "daily",
  assignmentType: "anyone",
  assignedUserId: null,
  assignment: { type: "anyone", user: null },
  scheduledTime: "09:00",
  notificationSlot: "morning",
  notificationTime: null,
  weekdays: [],
  weeklyTargetCount: null,
  startDate: "2026-08-01",
  targetDate: null,
  deadlineTime: "09:00",
  notificationOffsetMinutes: 0,
  active: true,
  sortOrder: 1,
  createdBy: "user-1",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-20T00:00:00.000Z"
};

const completedTask = {
  ...task,
  status: "completed",
  actedBy: { userId: "user-1", displayName: "E2E User" },
  startedAt: "2026-08-21T00:00:00.000Z",
  completedAt: "2026-08-21T00:10:00.000Z",
  skippedAt: null,
  note: null,
  scopeKind: "occurrence",
  displayGroup: "today",
  occurrenceKey: "2026-08-21",
  periodKey: null,
  periodStart: null,
  periodEnd: null,
  deadlineDate: "2026-08-21",
  overdue: false
};

const usage = {
  activeCount: 0,
  activeCountLimit: 50,
  activeBytes: 0,
  activeBytesLimit: 50 * 1024 * 1024,
  reservedCount: 0,
  reservedBytes: 0,
  pendingCleanupBytes: 0,
  pendingCleanupUnknownCount: 0,
  storedBytes: 0,
  storedBytesKnown: true,
  storedBytesLimit: 75 * 1024 * 1024,
  dailyUploadDate: null,
  dailyUploadCount: 0,
  dailyUploadLimit: 20
};

const json = (data: unknown, status = 200) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify({ ok: true, data, requestId: "e2e-account-notifications" })
});

const screenshot = async (page: Page, name: string) => {
  await mkdir(screenshotRoot, { recursive: true });
  await page.screenshot({ path: path.join(screenshotRoot, name), fullPage: true });
};

const setupApi = async (page: Page) => {
  let profileConfigured = false;
  let summary = {
    morningSummaryEnabled: true,
    morningSummaryTime: "09:00",
    eveningSummaryEnabled: true,
    eveningSummaryTime: "21:00",
    timezone: "Asia/Tokyo"
  };

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/auth/me") {
      return route.fulfill(
        json({
          user: {
            ...user,
            avatarUrl: profileConfigured ? "/api/users/user-1/avatar?v=2" : null
          }
        })
      );
    }
    if (url.pathname === "/api/households/current")
      return route.fulfill(json({ household }));
    if (url.pathname === "/api/households/current/members") {
      return route.fulfill(
        json({
          members: [
            {
              userId: "user-1",
              displayName: user.displayName,
              role: "owner",
              color: "#456",
              joinedAt: "2026-08-01T00:00:00.000Z",
              avatarUrl: profileConfigured ? "/api/users/user-1/avatar?v=2" : null
            }
          ]
        })
      );
    }
    if (url.pathname === "/api/households/current/image-usage")
      return route.fulfill(json(usage));
    if (url.pathname === "/api/account/avatar" && request.method() === "PUT") {
      profileConfigured = true;
      return route.fulfill(json({ avatarUrl: "/api/users/user-1/avatar?v=2" }));
    }
    if (url.pathname === "/api/account/avatar" && request.method() === "DELETE") {
      profileConfigured = false;
      return route.fulfill(json({ deleted: true, avatarUrl: null }));
    }
    if (url.pathname === "/api/users/user-1/avatar") {
      return route.fulfill({
        status: 200,
        contentType: "image/png",
        body: await readFile(fixture("shopping-item-portrait.png"))
      });
    }
    if (url.pathname === "/api/notifications/settings" && request.method() === "GET")
      return route.fulfill(json(summary));
    if (
      url.pathname === "/api/notifications/settings" &&
      request.method() === "PATCH"
    ) {
      summary = JSON.parse(request.postData() ?? "{}") as typeof summary;
      return route.fulfill(json(summary));
    }
    if (url.pathname === "/api/notifications/vapid-public-key")
      return route.fulfill(json({ publicKey: "AQIDBA" }));
    if (url.pathname === "/api/notifications/subscriptions")
      return route.fulfill(json({ registered: true, removed: true }));
    if (url.pathname === "/api/tasks/task-1" && request.method() === "GET")
      return route.fulfill(json({ task }));
    if (url.pathname === "/api/tasks/task-1/history")
      return route.fulfill(
        json({
          records: [
            {
              id: "record-1",
              targetDate: "2026-08-21",
              targetWeekStart: null,
              status: "completed",
              actedBy: { userId: "user-1", displayName: "E2E User" },
              startedAt: "2026-08-21T00:00:00.000Z",
              completedAt: "2026-08-21T00:10:00.000Z",
              skippedAt: null,
              note: null,
              createdAt: "2026-08-21T00:00:00.000Z",
              updatedAt: "2026-08-21T00:10:00.000Z"
            }
          ]
        })
      );
    if (url.pathname === "/api/tasks/today")
      return route.fulfill(json({ date: "2026-08-21", tasks: [completedTask] }));
    if (url.pathname === "/api/tasks/week")
      return route.fulfill(
        json({ weekStart: "2026-08-17", weekEnd: "2026-08-23", tasks: [] })
      );
    return route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({
        ok: false,
        error: { code: "NOT_FOUND", message: "not found" },
        requestId: "e2e-account-notifications"
      })
    });
  });
};

test.describe("account, notifications, and completed task edit UI", () => {
  test.beforeEach(async ({ page }) => {
    await setupApi(page);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "serviceWorker", {
        configurable: true,
        value: undefined
      });
      Object.defineProperty(window, "PushManager", {
        configurable: true,
        value: undefined
      });
    });
  });

  test("captures the requested final-head states", async ({ page }) => {
    await page.goto("/tasks/task-1");
    await expect(page.getByRole("heading", { name: "最近の履歴" })).toBeVisible();
    await screenshot(page, "completed-task-edit-entry.png");
    await page.getByRole("button", { name: "元のタスク設定を編集" }).click();
    await expect(page).toHaveURL(/\/tasks\/task-1\/edit$/);

    await page.goto("/settings/members");
    await expect(page.getByRole("heading", { name: "プロフィール画像" })).toBeVisible();
    await screenshot(page, "profile-image-unset.png");
    await page
      .locator("#profile-image-input")
      .setInputFiles(fixture("shopping-item-portrait.png"));
    await expect(page.getByText("プロフィール画像を保存しました。")).toBeVisible();
    await screenshot(page, "profile-image-set.png");
    await expect(page.getByRole("heading", { name: "朝のまとめ通知" })).toBeVisible();
    await screenshot(page, "notifications-morning-evening-on.png");

    const checkboxes = page.locator(
      ".notification-summary-settings input[type=checkbox]"
    );
    await checkboxes.nth(0).uncheck();
    await page.getByRole("button", { name: "朝/夜まとめ設定を保存" }).click();
    await expect(
      page.getByRole("button", { name: "朝/夜まとめ設定を保存" })
    ).toBeEnabled();
    await screenshot(page, "notifications-morning-off-evening-on.png");
  });
});
