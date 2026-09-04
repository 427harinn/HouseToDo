import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const artifactDir = path.resolve(process.env.PLAYWRIGHT_ARTIFACT_DIR ?? "artifacts/playwright/task-execution-timing");
const today = "2026-09-04";
const deadline = "2026-09-20";
const title = "エアコン掃除";

test.use({ viewport: { width: 390, height: 844 } });

type State = { task: Record<string, unknown> | null; completed: boolean; createPayload: Record<string, unknown> | null; updatePayload: Record<string, unknown> | null };

const json = (data: unknown, status = 200) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify({ ok: true, data, requestId: "task-execution-timing-e2e" })
});

const taskRecord = (state: State) => ({
  id: "record-deadline",
  taskId: "task-deadline",
  status: "completed",
  title,
  taskActive: true,
  actualCompleter: { userId: "user-1", displayName: "はる", avatarUrl: null },
  assignedUser: null,
  completedAt: "2026-09-04T03:00:00.000Z",
  skippedAt: null,
  targetDate: null,
  targetWeekStart: null,
  periodKey: "period:task-deadline:deadline:2026-09-04:2026-09-20",
  createdAt: "2026-09-04T00:00:00.000Z",
  updatedAt: "2026-09-04T03:00:00.000Z",
  ...(state.task ?? {})
});

const homeData = (state: State) => ({
  date: today,
  homeTasks: state.completed || !state.task ? [] : [{ ...state.task, status: "pending", scopeKind: "period", displayGroup: "month", overdue: false }],
  completedRecords: state.completed ? [taskRecord(state)] : [],
  passedRecords: [],
  shopping: { pendingCount: 0 },
  members: [{ userId: "user-1", displayName: "はる", role: "owner", color: "#d9f2eb", avatarUrl: null }]
});

const calendarData = (state: State, selectedDate = today) => ({
  from: "2026-08-30",
  to: "2026-10-10",
  today,
  timezone: "Asia/Tokyo",
  selectedDate,
  dates: { [deadline]: { fixedCount: 0, fixedCompletedCount: 0, fixedSkippedCount: 0, shoppingCount: 0, purchasedShoppingCount: 0, tasks: state.completed ? [] : [{ id: "task-deadline", title, deadline: true, status: "pending" }] } },
  selected: {
    fixed: [],
    weeklyFlexible: state.completed ? [] : [{ ...state.task, status: "pending", scopeKind: "period", displayGroup: "month", overdue: false }],
    monthlyFlexible: [],
    completed: state.completed ? [{ id: "record-deadline", taskId: "task-deadline", title, description: "", taskActive: true, selectedDate: today, actualCompleter: { userId: "user-1", displayName: "はる", avatarUrl: null }, calendarActionDate: today, targetDate: null, targetWeekStart: null, periodKey: "period:task-deadline:deadline:2026-09-04:2026-09-20", status: "completed", completedAt: "2026-09-04T03:00:00.000Z" }] : [],
    shopping: []
  }
});

const installRoutes = async (page: Page, state: State) => {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const fulfill = (data: unknown, status = 200) => route.fulfill(json(data, status));
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/auth/me") return fulfill({ user: { id: "user-1", email: "e2e@example.test", displayName: "はる" } });
    if (url.pathname === "/api/households/current") return fulfill({ household: { id: "household-1", name: "わが家", timezone: "Asia/Tokyo", weekStartsOn: 1, role: "owner" } });
    if (url.pathname === "/api/households/current/members") return fulfill({ members: [{ userId: "user-1", displayName: "はる", role: "owner", color: "#d9f2eb", avatarUrl: null }] });
    if (url.pathname === "/api/home/today") return fulfill(homeData(state));
    if (url.pathname === "/api/tasks/recent") return fulfill({ tasks: [] });
    if (url.pathname === "/api/tasks" && request.method() === "POST") {
      state.createPayload = request.postDataJSON() as Record<string, unknown>;
      state.task = {
        id: "task-deadline",
        title,
        description: "",
        recurrenceType: "once",
        modelRecurrenceType: "once",
        executionTiming: "by_deadline",
        assignmentType: "anyone",
        assignedUserId: null,
        assignment: { type: "anyone", user: null },
        scheduledTime: null,
        notificationSlot: "none",
        notificationTime: null,
        weekdays: [],
        weeklyTargetCount: null,
        startDate: today,
        targetDate: null,
        deadlineDate: deadline,
        deadlineTime: null,
        notificationOffsetMinutes: null,
        weeklyDeadlineWeekday: null,
        monthlyDayOfMonth: null,
        monthlyDeadlineType: null,
        active: true,
        sortOrder: 1,
        createdBy: "user-1",
        createdAt: "2026-09-04T00:00:00.000Z",
        updatedAt: "2026-09-04T00:00:00.000Z"
      };
      return fulfill({ task: state.task }, 201);
    }
    const taskMatch = url.pathname.match(/^\/api\/tasks\/(task-deadline)(?:\/(history|complete|reset|edit))?$/);
    if (taskMatch && request.method() === "GET") return fulfill({ task: state.task });
    if (taskMatch && taskMatch[2] === "history") return fulfill({ records: state.completed ? [{ status: "completed", completedAt: "2026-09-04T03:00:00.000Z" }] : [] });
    if (taskMatch && taskMatch[2] === "complete" && request.method() === "POST") {
      state.completed = true;
      return fulfill({ result: { status: "completed" } });
    }
    if (taskMatch && request.method() === "PATCH") {
      state.updatePayload = request.postDataJSON() as Record<string, unknown>;
      return fulfill({ task: state.task });
    }
    if (url.pathname === "/api/tasks/calendar/range") return fulfill({ ...calendarData(state), selected: undefined });
    if (url.pathname === "/api/tasks/calendar/day") return fulfill(calendarData(state, url.searchParams.get("date") ?? today));
    throw new Error(`Unexpected API request: ${request.method()} ${url.pathname}`);
  });
};

const screenshot = async (page: Page, name: string) => {
  await mkdir(artifactDir, { recursive: true });
  await page.screenshot({ path: path.join(artifactDir, name), fullPage: false });
};

test("separates execution timing, persists deadline semantics, and preserves history", async ({ page }) => {
  const state: State = { task: null, completed: false, createPayload: null, updatePayload: null };
  await installRoutes(page, state);

  await page.goto("/tasks/new");
  await expect(page.getByRole("heading", { name: "家事を追加" })).toBeVisible();
  await expect(page.getByRole("button", { name: "繰り返し: 今回だけ" })).toBeVisible();
  await expect(page.getByRole("button", { name: "実施時期: 日付を指定" })).toBeVisible();
  await expect(page.locator("#m2-task-deadline-date")).toHaveCount(0);
  await page.getByRole("button", { name: "実施時期: 日付を指定" }).click();
  const timingSheet = page.getByRole("dialog", { name: "実施時期" });
  await expect(timingSheet.getByRole("button", { name: "期限までに" })).toBeVisible();
  await timingSheet.getByRole("button", { name: "期限までに" }).click();
  await expect(page.getByRole("button", { name: "実施時期: 期限までに" })).toBeVisible();
  await expect(page.locator("#m2-task-deadline-date")).toBeVisible();
  await page.locator("#m2-task-deadline-date").fill(deadline);
  await page.getByRole("textbox", { name: "家事名" }).fill(title);
  await screenshot(page, "01-form-deadline-390x844.png");

  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect.poll(() => state.createPayload).not.toBeNull();
  expect(state.createPayload).toMatchObject({ recurrenceType: "once", modelRecurrenceType: "once", executionTiming: "by_deadline", targetDate: null, deadlineDate: deadline });
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByText("9/20まで")).toBeVisible();
  await screenshot(page, "02-home-deadline-390x844.png");

  await page.getByRole("button", { name: "カレンダー" }).click();
  await expect(page.getByRole("grid", { name: /カレンダー/ })).toBeVisible();
  await expect(page.getByText(title).first()).toBeVisible();
  await expect(page.locator(`.calendar-day-task[title="${title}"]`)).toHaveCount(1);
  await page.locator(`.calendar-day-cell[aria-label^="9月20日"]`).first().click();
  const calendarSheet = page.getByRole("dialog");
  await expect(calendarSheet.getByText("期間中", { exact: true })).toBeVisible();
  await expect(calendarSheet.getByText(title).first()).toBeVisible();
  await screenshot(page, "03-calendar-deadline-390x844.png");

  await page.goto("/tasks/task-deadline/edit");
  await expect(page.getByRole("heading", { name: "家事を編集" })).toBeVisible();
  await expect(page.getByRole("button", { name: "繰り返し: 今回だけ" })).toBeVisible();
  await expect(page.getByRole("button", { name: "実施時期: 期限までに" })).toBeVisible();
  await expect(page.locator("#m2-task-deadline-date")).toHaveValue(deadline);
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);

  const taskRow = page.getByRole("button", { name: `${title}の詳細` });
  await taskRow.click();
  await page.getByRole("button", { name: "完了", exact: true }).click();
  await expect(page.getByRole("button", { name: /完了済み 1/ })).toBeVisible();
  await page.getByRole("button", { name: /完了済み 1/ }).click();
  const completedRow = page.locator(".m2-home__history-list .m2-home__row", { hasText: title });
  await expect(completedRow).toBeVisible();
  expect(state.completed).toBe(true);
  await screenshot(page, "04-home-history-390x844.png");
});
