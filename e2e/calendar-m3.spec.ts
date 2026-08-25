import { expect, test } from "@playwright/test";

const response = (data: unknown) => ({ ok: true, data, requestId: "e2e-m3" });

function calendarData(selectedDate: string, completed = false) {
  const dates: Record<string, unknown> = {};
  const start = new Date("2026-07-26T00:00:00Z");
  for (let index = 0; index < 42; index += 1) {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + index);
    const key = date.toISOString().slice(0, 10);
    dates[key] = {
      fixedCount: key === "2026-08-20" && !completed ? 1 : 0,
      fixedCompletedCount: 0,
      fixedSkippedCount: 0,
      shoppingCount: key === "2026-08-20" ? 1 : 0,
      purchasedShoppingCount: 0,
      tasks: key === "2026-08-20" && !completed ? [{ id: "task-1", title: "朝食の片付け", deadline: false }] : []
    };
  }
  return {
    from: "2026-07-26", to: "2026-09-05", today: "2026-08-20", timezone: "Asia/Tokyo", selectedDate, dates,
    selected: {
      fixed: completed ? [] : [{ id: "task-1", title: "朝食の片付け", description: null, recurrenceType: "model_only", modelRecurrenceType: "once", assignmentType: "anyone", assignedUserId: null, assignment: { type: "anyone", user: null }, scheduledTime: null, notificationSlot: "none", weekdays: [], weeklyTargetCount: null, targetDate: selectedDate, active: true, sortOrder: 1, createdBy: "user-1", createdAt: "2026-08-01", updatedAt: "2026-08-01", status: "pending", actedBy: null, startedAt: null, completedAt: null, skippedAt: null, note: null, scopeKind: "occurrence", occurrenceKey: `occurrence:task-1:${selectedDate}`, periodKey: null, periodStart: selectedDate, periodEnd: selectedDate, deadlineDate: selectedDate, overdue: false }],
      weeklyFlexible: [], monthlyFlexible: [],
      completed: completed ? [{ id: "record-1", taskId: "task-1", title: "朝食の片付け", taskActive: true, selectedDate, actualCompleter: { userId: "user-1", displayName: "はる", avatarUrl: null }, targetDate: selectedDate, targetWeekStart: null, status: "completed" }] : [],
      shopping: [{ id: "shopping-1", name: "牛乳", quantity: "2本", note: "hidden", status: "pending", plannedPurchaseDate: selectedDate, purchasedAt: null, purchasedBy: null }]
    }
  };
}

test.describe("Calendar M3", () => {
  test.beforeEach(async ({ page }) => {
    let completed = false;
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      if (!url.pathname.startsWith("/api/")) return route.continue();
      if (url.pathname === "/api/auth/me") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(response({ user: { id: "user-1", email: "e2e@example.com", displayName: "はる" } })) });
      if (url.pathname === "/api/households/current") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(response({ household: { id: "house-1", name: "E2E House", timezone: "Asia/Tokyo", weekStartsOn: 0, role: "owner" } })) });
      if (url.pathname === "/api/tasks/calendar") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(response(calendarData(url.searchParams.get("selectedDate") ?? "2026-08-20", completed))) });
      if (url.pathname.endsWith("/complete")) { completed = true; return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(response({ result: {} })) }); }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(response({})) });
    });
  });

  test("renders the 42-cell grid and pending planned Shopping marker", async ({ page }) => {
    await page.goto("/calendar");
    await expect(page.locator(".calendar-page")).toBeVisible();
    await expect(page.locator(".calendar-day-cell")).toHaveCount(42);
    await expect(page.getByRole("heading", { name: "2026年8月" })).toBeVisible();
    await expect(page.locator(".calendar-day-cell").filter({ hasText: "朝食の片付け" })).toHaveCount(1);
    await expect(page.locator(".calendar-day-shopping")).toHaveCount(1);
  });

  test("opens Date Sheet and completes the selected task", async ({ page }) => {
    await page.goto("/calendar?date=2026-08-20");
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: "8/20木曜日" })).toBeVisible();
    await expect(page.getByText("この日")).toBeVisible();
    await page.locator(".calendar-detail-task__main").click();
    await expect(page.getByRole("button", { name: /完了済み 1/ })).toBeVisible({ timeout: 2_000 });
  });
});
