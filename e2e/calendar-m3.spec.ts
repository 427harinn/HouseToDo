import { expect, test } from "@playwright/test";
import path from "node:path";
import { mkdir } from "node:fs/promises";

const artifactRoot = process.env.PLAYWRIGHT_ARTIFACT_DIR ?? "artifacts/playwright/calendar-m3";

const response = (data: unknown) => ({ ok: true, data, requestId: "e2e-m3" });
const expectNoHorizontalScroll = async (page: import("@playwright/test").Page) => {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
};

function calendarTask(id: string, title: string, selectedDate: string) {
  return { id, title, description: null, recurrenceType: "model_only", modelRecurrenceType: "once", assignmentType: "anyone", assignedUserId: null, assignment: { type: "anyone", user: null }, scheduledTime: null, notificationSlot: "none", weekdays: [], weeklyTargetCount: null, targetDate: selectedDate, active: true, sortOrder: 1, createdBy: "user-1", createdAt: "2026-08-01", updatedAt: "2026-08-01", status: "pending", actedBy: null, startedAt: null, completedAt: null, skippedAt: null, note: null, scopeKind: "occurrence", occurrenceKey: `occurrence:${id}:${selectedDate}`, periodKey: null, periodStart: selectedDate, periodEnd: selectedDate, deadlineDate: selectedDate, overdue: false };
}

function calendarData(selectedDate: string, completed = false, passed = false, multi = false) {
  const hasMultiple = multi || selectedDate === "2026-08-21";
  const dates: Record<string, unknown> = {};
  const start = new Date("2026-07-26T00:00:00Z");
  for (let index = 0; index < 42; index += 1) {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + index);
    const key = date.toISOString().slice(0, 10);
    dates[key] = {
      fixedCount: key === "2026-08-20" && !completed && !passed ? 1 : 0,
      fixedCompletedCount: 0,
      fixedSkippedCount: 0,
      shoppingCount: key === "2026-08-20" ? 1 : 0,
      purchasedShoppingCount: 0,
      tasks: key === "2026-08-20" && !completed && !passed ? [{ id: "task-1", title: "朝食の片付け", deadline: false }, ...(hasMultiple ? [{ id: "task-2", title: "夕食の片付け", deadline: false }] : [])] : []
    };
  }
  return {
    from: "2026-07-26", to: "2026-09-05", today: "2026-08-20", timezone: "Asia/Tokyo", selectedDate, dates,
    selected: {
      fixed: completed || passed ? [] : [calendarTask("task-1", "朝食の片付け", selectedDate), ...(hasMultiple ? [calendarTask("task-2", "夕食の片付け", selectedDate)] : [])],
      weeklyFlexible: [], monthlyFlexible: [],
      completed: completed ? [{ id: "record-1", taskId: "task-1", title: "朝食の片付け", taskActive: true, selectedDate, actualCompleter: { userId: "user-1", displayName: "はる", avatarUrl: null }, targetDate: selectedDate, targetWeekStart: null, status: "completed" }] : [],
      shopping: [{ id: "shopping-1", name: "牛乳", quantity: "2本", note: "hidden", status: "pending", plannedPurchaseDate: selectedDate, purchasedAt: null, purchasedBy: null }]
    }
  };
}

test.describe("Calendar M3", () => {
  test.beforeEach(async ({ page }) => {
    let completed = false;
    let passed = false;
    let delayedCalendarRefresh = false;
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      if (!url.pathname.startsWith("/api/")) return route.continue();
      if (url.pathname === "/api/auth/me") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(response({ user: { id: "user-1", email: "e2e@example.com", displayName: "はる" } })) });
      if (url.pathname === "/api/households/current") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(response({ household: { id: "house-1", name: "E2E House", timezone: "Asia/Tokyo", weekStartsOn: 0, role: "owner" } })) });
      if (url.pathname === "/api/households/current/members") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(response({ members: [] })) });
      if (url.pathname === "/api/tasks/task-1" && route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(response({ task: { id: "task-1", title: "朝食の片付け", description: null, recurrenceType: "model_only", modelRecurrenceType: "once", assignmentType: "anyone", assignedUserId: null, startDate: "2026-08-20", targetDate: "2026-08-20", deadlineTime: null, notificationOffsetMinutes: null, weekdays: [], weeklyTargetCount: null, active: true } })) });
      if (url.pathname === "/api/tasks/task-1/history") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(response({ records: [] })) });
      if (url.pathname === "/api/tasks/calendar") { if (delayedCalendarRefresh) { delayedCalendarRefresh = false; await new Promise((resolve) => setTimeout(resolve, 300)); } return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(response(calendarData(url.searchParams.get("selectedDate") ?? "2026-08-20", completed, passed, url.searchParams.get("multi") === "1"))) }); }
      if (url.pathname.endsWith("/complete")) { completed = true; delayedCalendarRefresh = true; return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(response({ result: {} })) }); }
      if (url.pathname.endsWith("/skip")) { passed = true; return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(response({ result: {} })) }); }
      if (url.pathname.endsWith("/calendar-restore")) { completed = false; return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(response({ result: { reset: true } })) }); }
      throw new Error(`Unexpected Calendar API request: ${route.request().method()} ${url.pathname}`);
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
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/calendar?date=2026-08-20");
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.locator(".bottom-nav")).toBeVisible();
    await page.waitForTimeout(300);
    const dialogBox = await page.getByRole("dialog").boundingBox();
    const layerBox = await page.locator(".calendar-date-layer").boundingBox();
    const navBox = await page.locator(".bottom-nav").boundingBox();
    if (!dialogBox || !layerBox || !navBox) throw new Error("Calendar Date Sheet or Bottom Navigation is not measurable.");
    expect(layerBox.y).toBe(0);
    expect(layerBox.height).toBeGreaterThanOrEqual(844);
    expect(dialogBox.y + dialogBox.height).toBeGreaterThanOrEqual(navBox.y + navBox.height - 1);
    await expect(page.getByRole("heading", { name: "8月20日 木曜日" })).toBeVisible();
    await expect(page.getByText("この日")).toBeVisible();
    await page.locator(".calendar-detail-task__main").click();
    await expect(page.getByRole("button", { name: /完了済み 1/ })).toBeVisible({ timeout: 2_000 });
  });

  test("passes without showing a completion check", async ({ page }) => {
    await page.goto("/calendar?date=2026-08-20");
    const task = page.locator(".calendar-detail-task");
    const box = await task.boundingBox();
    if (!box) throw new Error("Calendar task row is not visible.");
    await page.mouse.move(box.x + 160, box.y + 24);
    await page.mouse.down();
    await page.mouse.move(box.x + 20, box.y + 24);
    await page.mouse.up();
    await page.getByRole("button", { name: "パス" }).click();
    await expect(task).toHaveClass(/is-passing/);
    await expect(task.locator(".calendar-detail-task__check svg")).toHaveCount(0);
    await expect(task).toHaveCount(0, { timeout: 2_000 });
  });

  test("matches Home swipe layout for active Calendar tasks", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/calendar?date=2026-08-20");
    const row = page.locator(".calendar-detail-task").first();
    const before = await row.boundingBox();
    if (!before) throw new Error("Calendar active task row is not measurable.");
    expect(await row.locator(".m2-home__row-content").evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgb(255, 255, 255)");
    await page.mouse.move(before.x + 160, before.y + 24);
    await page.mouse.down();
    await page.mouse.move(before.x + 20, before.y + 24, { steps: 8 });
    await page.mouse.up();
    await expect(row.getByRole("button", { name: "編集" })).toBeVisible();
    await expect(row.getByRole("button", { name: "パス" })).toBeVisible();
    const after = await row.boundingBox();
    const content = await row.locator(".m2-home__row-content").boundingBox();
    const actions = await row.locator(".m2-home__actions").boundingBox();
    if (!after || !content || !actions) throw new Error("Calendar swipe action layout is not measurable.");
    expect(after.height - before.height).toBeLessThanOrEqual(2);
    expect(Math.abs(actions.y - after.y)).toBeLessThanOrEqual(1);
    expect(actions.x).toBeGreaterThanOrEqual(after.x);
    expect(actions.y + actions.height).toBeLessThanOrEqual(after.y + after.height + 1);
    expect(content.y).toBe(after.y);

    await page.mouse.move(after.x + 20, after.y + 24);
    await page.mouse.down();
    await page.mouse.move(after.x + 160, after.y + 24, { steps: 6 });
    await page.mouse.up();
    await expect(row).not.toHaveClass(/is-actions-open/);

    await page.mouse.move(after.x + 160, after.y + 24);
    await page.mouse.down();
    await page.mouse.move(after.x + 20, after.y + 24, { steps: 8 });
    await page.mouse.up();
    await row.getByRole("button", { name: "編集" }).click();
    await expect(page).toHaveURL(/\/tasks\/task-1\/edit\?origin=calendar&calendarDate=2026-08-20/);
  });

  test("keeps only one active Calendar swipe row open and closes it on right swipe", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/calendar?date=2026-08-21");
    const rows = page.locator(".calendar-detail-task");
    await expect(rows).toHaveCount(2);
    const firstBox = await rows.nth(0).boundingBox();
    const secondBox = await rows.nth(1).boundingBox();
    if (!firstBox || !secondBox) throw new Error("Calendar active task rows are not measurable.");
    await page.mouse.move(firstBox.x + 160, firstBox.y + 24);
    await page.mouse.down();
    await page.mouse.move(firstBox.x + 20, firstBox.y + 24, { steps: 8 });
    await page.mouse.up();
    await expect(rows.nth(0)).toHaveClass(/is-actions-open/);
    await page.mouse.move(secondBox.x + 160, secondBox.y + 24);
    await page.mouse.down();
    await page.mouse.move(secondBox.x + 20, secondBox.y + 24, { steps: 8 });
    await page.mouse.up();
    await expect(rows.nth(0)).not.toHaveClass(/is-actions-open/);
    await expect(rows.nth(1)).toHaveClass(/is-actions-open/);
    await page.mouse.move(secondBox.x + 20, secondBox.y + 24);
    await page.mouse.down();
    await page.mouse.move(secondBox.x + 160, secondBox.y + 24, { steps: 6 });
    await page.mouse.up();
    await expect(rows.nth(1)).not.toHaveClass(/is-actions-open/);
  });

  test("keeps the completing state until the refreshed server state settles", async ({ page }) => {
    await page.goto("/calendar?date=2026-08-20");
    const task = page.locator(".calendar-detail-task");
    await task.locator(".calendar-detail-task__main").click();
    await page.waitForTimeout(450);
    await expect(task).toHaveClass(/is-completing/);
    await expect(task).toHaveCount(0, { timeout: 2_000 });
  });

  test("restores a completed task and keeps the Date Sheet open", async ({ page }) => {
    await page.goto("/calendar?date=2026-08-20");
    await page.locator(".calendar-detail-task__main").click();
    await expect(page.getByRole("button", { name: /完了済み 1/ })).toBeVisible({ timeout: 2_000 });
    await page.getByRole("button", { name: /完了済み 1/ }).click();
    const row = page.locator(".calendar-history-row");
    await expect(row.locator(".m2-home__row-content")).toHaveCSS("background-color", "rgb(255, 255, 255)");
    const box = await row.boundingBox();
    if (!box) throw new Error("Calendar completed row is not visible.");
    await page.mouse.move(box.x + 160, box.y + 24);
    await page.mouse.down();
    await page.mouse.move(box.x + 20, box.y + 24);
    await page.mouse.up();
    await page.getByRole("button", { name: "戻す" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.locator(".calendar-detail-task__main")).toBeVisible();
    await expect(page.getByRole("button", { name: /完了済み/ })).toHaveCount(0);
  });

  test("axis-locks month swipes and suppresses accidental grid opens", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/calendar");
    const grid = page.locator(".calendar-month-grid");
    const box = await grid.boundingBox();
    if (!box) throw new Error("Calendar grid is not measurable.");
    await page.mouse.move(box.x + 180, box.y + 180);
    await page.mouse.down();
    await page.mouse.move(box.x + 70, box.y + 180, { steps: 6 });
    await page.mouse.up();
    await expect(page.getByRole("heading", { name: "2026年9月" })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expectNoHorizontalScroll(page);
  });

  test("locks the Calendar viewport vertically while preserving date opens and Today", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/calendar");
    const viewport = page.locator(".app-shell__viewport");
    const initialScrollTop = await viewport.evaluate((element) => element.scrollTop);
    const grid = page.locator(".calendar-month-grid");
    const box = await grid.boundingBox();
    if (!box) throw new Error("Calendar grid is not measurable.");
    await page.mouse.move(box.x + 180, box.y + 150);
    await page.mouse.down();
    await page.mouse.move(box.x + 180, box.y + 360, { steps: 8 });
    await page.mouse.up();
    expect(await viewport.evaluate((element) => element.scrollTop)).toBe(initialScrollTop);
    expect(await page.locator("html").evaluate((element) => element.classList.contains("calendar-view-locked"))).toBe(true);
    await expect(page.getByRole("heading", { name: "2026年8月" })).toBeVisible();

    await page.locator('.calendar-day-cell[aria-label^="8月20日"]').click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "閉じる", exact: true }).click();
    const task = page.locator(".calendar-day-task").first();
    if (await task.count()) expect(await task.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
    await page.getByRole("button", { name: "今日", exact: true }).click();
    expect(await page.getByRole("button", { name: "今日", exact: true }).evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
    await mkdir(artifactRoot, { recursive: true });
    await page.screenshot({ path: path.resolve(artifactRoot, "calendar-vertical-lock-touch-state.png"), fullPage: true });
  });

  test("dismisses Date Sheet only after the downward swipe threshold and blocks the footer", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/calendar?date=2026-08-20");
    const dialog = page.getByRole("dialog");
    const box = await dialog.boundingBox();
    if (!box) throw new Error("Calendar Date Sheet is not measurable.");
    await page.mouse.move(box.x + 180, box.y + 24);
    await page.mouse.down();
    await page.mouse.move(box.x + 180, box.y + 80, { steps: 4 });
    await page.mouse.up();
    await expect(dialog).toBeVisible();

    const footerBox = await page.locator(".bottom-nav__button").first().boundingBox();
    if (!footerBox) throw new Error("Bottom Navigation is not measurable.");
    const footerHit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest(".calendar-date-layer")?.className ?? "", { x: footerBox.x + footerBox.width / 2, y: footerBox.y + footerBox.height / 2 });
    expect(footerHit).toBe("calendar-date-layer");
    await expect(page).toHaveURL(/\/calendar\?date=2026-08-20/);

    await page.mouse.move(box.x + 180, box.y + 24);
    await page.mouse.down();
    await page.mouse.move(box.x + 180, box.y + 150, { steps: 6 });
    await page.mouse.up();
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 2_000 });
    await expect(page.locator(".calendar-date-layer")).toHaveCount(0);
  });
});
