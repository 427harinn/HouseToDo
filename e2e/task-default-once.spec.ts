import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const artifactDir = path.resolve(process.env.PLAYWRIGHT_ARTIFACT_DIR ?? "artifacts/playwright/task-default-once");
const householdTimezone = "Asia/Tokyo";
const today = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: householdTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const json = (data: unknown, status = 200) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify({ ok: true, data, requestId: "task-default-once-e2e" })
});

const screenshot = async (page: Page, name: string) => {
  await mkdir(artifactDir, { recursive: true });
  await page.screenshot({ path: path.join(artifactDir, name), fullPage: false });
};

const assertNoHorizontalOverflow = async (page: Page) => {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth) + 1);
};

type TaskState = { createdPayloads: Array<Record<string, unknown>> };

const installRoutes = async (page: Page, state: TaskState) => {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/auth/me") return route.fulfill(json({ user: { id: "user-1", email: "e2e@example.test", displayName: "はる" } }));
    if (url.pathname === "/api/households/current") return route.fulfill(json({ household: { id: "household-1", name: "わが家", timezone: "Asia/Tokyo", weekStartsOn: 1, role: "owner" } }));
    if (url.pathname === "/api/households/current/members") return route.fulfill(json({ members: [{ userId: "user-1", displayName: "はる", role: "owner", color: "#d9f2eb", avatarUrl: null }] }));
    if (url.pathname === "/api/tasks/recent") return route.fulfill(json({ tasks: [{ id: "recent-daily", title: "最近の毎日家事", recurrenceType: "daily", modelRecurrenceType: "daily", assignmentType: "anyone", assignedUserId: null, description: "", startDate: "2026-08-01", targetDate: null, deadlineTime: null, notificationOffsetMinutes: null, weekdays: [], weeklyTargetCount: null, weeklyDeadlineWeekday: null, monthlyDayOfMonth: null, monthlyDeadlineType: null, active: true }] }));
    if (url.pathname === "/api/tasks/task-edit" && request.method() === "GET") return route.fulfill(json({ task: { id: "task-edit", title: "既存の毎日家事", description: "メモ", recurrenceType: "daily", modelRecurrenceType: "daily", assignmentType: "anyone", assignedUserId: null, startDate: today(), targetDate: null, deadlineTime: null, notificationOffsetMinutes: null, weekdays: [], weeklyTargetCount: null, weeklyDeadlineWeekday: null, monthlyDayOfMonth: null, monthlyDeadlineType: null, active: true } }));
    if (url.pathname === "/api/tasks/task-edit/history") return route.fulfill(json({ records: [] }));
    if (url.pathname === "/api/tasks" && request.method() === "POST") {
      state.createdPayloads.push(request.postDataJSON() as Record<string, unknown>);
      return route.fulfill(json({ task: { id: "task-created" } }, 201));
    }
    throw new Error(`Unexpected task API request: ${request.method()} ${url.pathname}`);
  });
};

test.describe("new task default recurrence", () => {
  test("keeps once selected on create, preserves edit recurrence, and lets reuse override it", async ({ page }) => {
    const state: TaskState = { createdPayloads: [] };
    await installRoutes(page, state);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/tasks/new");
    await expect(page.getByRole("heading", { name: "家事を追加" })).toBeVisible();
    await expect(page.getByRole("button", { name: "繰り返し: 今回だけ" })).toBeVisible();
    await expect(page.locator("#m2-task-start-date")).toHaveValue(today());
    await assertNoHorizontalOverflow(page);
    await screenshot(page, "new-initial-390x844.png");

    await page.getByRole("button", { name: "繰り返し: 今回だけ" }).click();
    const repeatSheet = page.getByRole("dialog", { name: "繰り返し" });
    await expect(repeatSheet).toBeVisible();
    await expect(repeatSheet.getByRole("button", { name: "今回だけ" }).locator("svg")).toHaveCount(1);
    await page.waitForTimeout(300);
    await screenshot(page, "new-repeat-sheet-390x844.png");
    await repeatSheet.getByRole("button", { name: "閉じる", exact: true }).click();

    await page.getByRole("button", { name: "以前の項目から選ぶ" }).click();
    await page.getByRole("dialog", { name: "以前の項目から選ぶ" }).getByRole("button", { name: /最近の毎日家事/ }).click();
    await expect(page.getByRole("button", { name: "繰り返し: 毎日" })).toBeVisible();
    await expect(page.locator("#m2-task-start-date")).toHaveValue(today());

    await page.goto("/tasks/task-edit/edit");
    await expect(page.getByRole("heading", { name: "家事を編集" })).toBeVisible();
    await expect(page.getByRole("button", { name: "繰り返し: 毎日" })).toBeVisible();
    await page.getByRole("button", { name: "繰り返し: 毎日" }).click();
    const editRepeatSheet = page.getByRole("dialog", { name: "繰り返し" });
    await expect(editRepeatSheet.getByRole("button", { name: "毎日" }).locator("svg")).toHaveCount(1);
    await page.waitForTimeout(300);
    await screenshot(page, "edit-daily-390x844.png");

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/tasks/new");
    await expect(page.getByRole("button", { name: "繰り返し: 今回だけ" })).toBeVisible();
    await expect(page.locator("#m2-task-start-date")).toHaveValue(today());
    await assertNoHorizontalOverflow(page);
    await screenshot(page, "new-initial-375x812.png");
    await page.getByRole("button", { name: "繰り返し: 今回だけ" }).click();
    const narrowRepeatSheet = page.getByRole("dialog", { name: "繰り返し" });
    await expect(narrowRepeatSheet.getByRole("button", { name: "今回だけ" }).locator("svg")).toHaveCount(1);
    await assertNoHorizontalOverflow(page);
    await page.waitForTimeout(300);
    await screenshot(page, "new-repeat-sheet-375x812.png");

    await narrowRepeatSheet.getByRole("button", { name: "閉じる", exact: true }).click();
    await page.goto("/tasks/new");
    await page.getByRole("textbox", { name: "家事名" }).fill("デフォルト今回だけ");
    await page.getByRole("button", { name: "保存" }).click();
    await expect.poll(() => state.createdPayloads).toHaveLength(1);
    expect(state.createdPayloads[0]).toMatchObject({
      recurrenceType: "once",
      modelRecurrenceType: "once",
      startDate: today(),
      targetDate: today()
    });
  });
});
