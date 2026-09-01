import { expect, test, type Page } from "@playwright/test";
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

const evidenceDir = path.resolve(process.env.PLAYWRIGHT_ARTIFACT_DIR ?? "artifacts/playwright/m2-home-task");
const today = "2026-08-25";
type HomeState = { completed: boolean; passed: boolean; deleted: boolean; completeCalls?: number; empty?: boolean; overdue?: boolean; completedTaskId?: string; completedTitle?: string; passedTaskId?: string; passedTitle?: string };

test.use({
  viewport: { width: 390, height: 844 },
  video: { mode: "on", size: { width: 390, height: 844 } }
});

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-08-25T12:00:00+09:00") });
});

const task = (id: string, title: string, scope: "date" | "date-all-day" | "week" | "month" | "none" | "overdue", assignedUserId: string | null = null, description = "") => ({
  id,
  title,
  description,
  recurrenceType: scope === "week" ? "weekly" : "daily",
  modelRecurrenceType: scope === "week" ? "weekly_flexible" : scope === "month" ? "monthly_flexible" : scope === "none" ? "daily" : "daily",
  assignmentType: assignedUserId ? "specific" : "anyone",
  assignedUserId,
  status: "pending",
  deadlineDate: scope === "none" ? null : scope === "week" ? "2026-08-30" : scope === "month" ? "2026-08-31" : today,
  deadlineTime: scope === "date" || scope === "overdue" ? "09:00" : null,
  scheduledTime: null,
  targetDate: today,
  overdue: scope === "overdue"
});

const historyRecord = (id: string, taskId: string, status: "completed" | "skipped", title: string, taskActive = true) => ({
  id,
  taskId,
  status,
  title,
  taskActive,
  actualCompleter: { userId: "user-1", displayName: "さや", avatarUrl: null },
  assignedUser: { userId: "user-2", displayName: "たくや", color: "#e4eef8", avatarUrl: null }
});

const homeData = (state: HomeState) => ({
  date: today,
  homeTasks: state.empty ? [] : homeTasks(state),
  completedRecords: state.completed ? [historyRecord("record-completed", state.completedTaskId ?? "m2-task-1", "completed", state.completedTitle ?? "ゴミ出し", state.deleted)] : [],
  passedRecords: state.passed ? [historyRecord("record-passed", state.passedTaskId ?? "m2-task-1", "skipped", state.passedTitle ?? "窓ふき", false)] : [],
  shopping: { pendingCount: 2 },
  members: [{ userId: "user-1", displayName: "さや", role: "owner", color: "#d9f2eb", avatarUrl: null }, { userId: "user-2", displayName: "たくや", role: "member", color: "#e4eef8", avatarUrl: null }]
});

const homeTasks = (state: HomeState) => {
  const allTasks = [
    ...(state.overdue ? [task("m2-overdue", "期限超過の家事", "overdue")] : []),
    task("m2-date", "朝の片付け", "date", null, "朝のメモ"),
    task("m2-date-all-day", "今日中の家事", "date-all-day"),
    task("m2-week", "週の家事", "week"),
    task("m2-month", "月の家事", "month"),
    task("m2-none", "期限なし", "none", "user-2")
  ];
  const actionTaskId = state.completedTaskId ?? state.passedTaskId;
  return state.completed || state.passed
    ? actionTaskId ? allTasks.filter((item) => item.id !== actionTaskId) : [task("m2-date", "朝の片付け", "date"), task("m2-none", "期限なし", "none")]
    : allTasks;
};

const installRoutes = async (page: Page, state: HomeState) => {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (data: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ ok: true, data, requestId: "m2-e2e" }) });
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/auth/me") return json({ user: { id: "user-1", email: "e2e@example.test", displayName: "さや" } });
    if (url.pathname === "/api/households/current") return json({ household: { id: "household-1", name: "わが家", timezone: "Asia/Tokyo", weekStartsOn: 1, role: "owner" } });
    if (url.pathname === "/api/households/current/members") return json({ members: homeData(state).members });
    if (url.pathname === "/api/households/current/image-usage") return json({ activeCount: 0, activeBytes: 0, reservedCount: 0, reservedBytes: 0, pendingCleanupBytes: 0, pendingCleanupUnknownCount: 0, storedBytes: 0, storedBytesKnown: true, activeCountLimit: 50, activeBytesLimit: 52428800, storedBytesLimit: 78643200, dailyUploadLimit: 20 });
    if (url.pathname === "/api/home/today") return json(homeData(state));
    const actionMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/(complete|skip|restore)$/);
    if (actionMatch && request.method() === "POST") {
      const [, actionTaskId, action] = actionMatch;
      const titles: Record<string, string> = { "m2-overdue": "期限超過の家事", "m2-date": "朝の片付け", "m2-date-all-day": "今日中の家事", "m2-week": "週の家事", "m2-month": "月の家事", "m2-none": "期限なし" };
      if (!titles[actionTaskId] && actionTaskId !== "m2-task-1") throw new Error(`Unexpected M2 action task: ${actionTaskId}`);
      if (action === "complete") { state.completeCalls = (state.completeCalls ?? 0) + 1; state.completed = true; state.completedTaskId = actionTaskId; state.completedTitle = titles[actionTaskId] ?? "ゴミ出し"; }
      if (action === "skip") { state.passed = true; state.passedTaskId = actionTaskId; state.passedTitle = titles[actionTaskId] ?? "窓ふき"; }
      if (action === "restore") { state.completed = false; state.passed = false; state.deleted = false; }
      return json({ result: action === "restore" ? { reset: true } : { status: action === "skip" ? "skipped" : "completed" } });
    }
    if (url.pathname === "/api/tasks/recent") return json({ tasks: [{ id: "recent-1", title: "床そうじ", recurrenceType: "daily", modelRecurrenceType: "daily", assignmentType: "anyone", assignedUserId: null, description: "", startDate: "2026-08-01", targetDate: null, deadlineTime: null, notificationOffsetMinutes: null, weekdays: [], weeklyTargetCount: null, weeklyDeadlineWeekday: null, monthlyDayOfMonth: null, monthlyDeadlineType: null, active: true }] });
    if (url.pathname.startsWith("/api/tasks/task-edit") && !url.pathname.endsWith("/history") && request.method() === "GET") return json({ task: { id: "task-edit", title: "編集する家事", description: "メモ", recurrenceType: "daily", modelRecurrenceType: "daily", assignmentType: "anyone", assignedUserId: null, startDate: today, targetDate: null, deadlineTime: "09:00", notificationOffsetMinutes: 30, weekdays: [], weeklyTargetCount: null, active: true } });
    if (url.pathname === "/api/tasks/task-edit/history") return json({ records: [{ status: "completed", completedAt: "2026-08-20T01:00:00.000Z" }] });
    throw new Error(`Unexpected M2 API request: ${request.method()} ${url.pathname}`);
  });
};

const neutralize = async (page: Page) => {
  await page.addStyleTag({ content: ".m2-home__row:hover .m2-home__more { opacity: 0 !important; pointer-events: none !important; } * { caret-color: transparent !important; }" });
  await page.mouse.move(8, 8);
};

const screenshot = async (page: Page, name: string) => {
  await mkdir(evidenceDir, { recursive: true });
  await page.screenshot({ path: path.join(evidenceDir, name), fullPage: false });
};

const copyVideo = async (page: Page, name: string) => {
  const video = page.video();
  const context = page.context();
  await context.close();
  if (video) {
    await mkdir(evidenceDir, { recursive: true });
    await copyFile(await video.path(), path.join(evidenceDir, name));
  }
};

test("M2 Home visual states and swipe actions at 390x844", async ({ page }) => {
  const state: HomeState = { completed: false, passed: false, deleted: false, overdue: false };
  await installRoutes(page, state);
  await page.goto("/home");
  await expect(page.getByRole("heading", { name: "やること" })).toBeVisible();
  await expect(page.locator(".m2-home__task-title", { hasText: "期限超過の家事" })).toHaveCount(0);
  await expect(page.getByText("今日中の家事")).toBeVisible();
  await expect(page.getByText("買い物 2件")).toBeVisible();
  const navBeforeScroll = await page.locator(".bottom-nav").boundingBox();
  if (!navBeforeScroll) throw new Error("Bottom Navigation is not measurable.");
  await page.locator(".app-shell__viewport").evaluate((element) => element.scrollTo({ top: 300 }));
  await expect.poll(async () => (await page.locator(".bottom-nav").boundingBox())?.y ?? -1).toBe(navBeforeScroll.y);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  await neutralize(page);
  await screenshot(page, "01-home-normal-390x844.png");
  state.overdue = true;
  await page.reload();
  await expect(page.getByText("期限超過の家事")).toBeVisible();
  await expect(page.getByText("今日中の家事")).toBeVisible();
  await neutralize(page);
  await screenshot(page, "02-home-overdue-390x844.png");
  await expect(page.getByRole("button", { name: /完了済み/ })).toHaveCount(0);

  state.completed = true;
  await page.reload();
  const completedToggle = page.getByRole("button", { name: /完了済み 1/ });
  await expect(completedToggle).toHaveAttribute("aria-expanded", "false");
  await screenshot(page, "03-home-completed-collapsed-390x844.png");
  await completedToggle.click();
  await expect(page.getByText("ゴミ出し")).toBeVisible();
  await page.waitForTimeout(240);
  await neutralize(page);
  await screenshot(page, "04-home-completed-open-390x844.png");

  state.passed = true;
  await page.reload();
  await page.getByRole("button", { name: /パス済み 1/ }).click();
  await expect(page.getByText("窓ふき")).toBeVisible();
  await page.waitForTimeout(240);
  await screenshot(page, "05-home-passed-open-390x844.png");

  await page.reload();
  const swipeRow = page.locator(".m2-home__row").first();
  const box = await swipeRow.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + 180, box!.y + 30);
  await page.mouse.down();
  await page.mouse.move(box!.x + 70, box!.y + 30, { steps: 5 });
  await page.mouse.up();
  await expect(swipeRow.getByRole("button", { name: "パス" })).toBeVisible();
  await neutralize(page);
  await screenshot(page, "06-home-swipe-actions-390x844.png");

  await expect(swipeRow).toHaveClass(/is-actions-open/);
  await page.getByRole("button", { name: /完了済み 1/ }).click();
  await page.locator(".m2-home__history-list .m2-home__row").first().waitFor();
  const historyRow = page.locator(".m2-home__history-list .m2-home__row").first();
  const historyBox = await historyRow.boundingBox();
  expect(historyBox).not.toBeNull();
  await page.mouse.move(historyBox!.x + 180, historyBox!.y + 30);
  await page.mouse.down();
  await page.mouse.move(historyBox!.x + 70, historyBox!.y + 30, { steps: 5 });
  await page.mouse.up();
  await expect(historyRow).toHaveClass(/is-actions-open/);
  await expect(swipeRow).not.toHaveClass(/is-actions-open/);
});

test("M2 active task opens inline detail, keeps memo below Complete, and completes only from Complete", async ({ page }) => {
  const state: HomeState = { completed: false, passed: false, deleted: false };
  await installRoutes(page, state);
  await page.goto("/home");
  const memoRow = page.locator(".m2-home__row").filter({ hasText: "朝の片付け" });
  await memoRow.locator(".m2-home__row-main").click();
  await expect(memoRow).toHaveClass(/is-expanded/);
  await expect(memoRow.locator(".m2-home__primary")).toBeVisible();
  await expect(memoRow.getByText("朝のメモ")).toBeVisible();
  expect(await memoRow.locator(".m2-home__primary").evaluate((button) => button.parentElement?.firstElementChild === button)).toBe(true);
  expect(state.completeCalls ?? 0).toBe(0);
  const memoBox = await memoRow.boundingBox();
  if (!memoBox) throw new Error("Home memo row is not measurable.");
  await page.mouse.move(memoBox.x + 190, memoBox.y + 30);
  await page.mouse.down();
  await page.mouse.move(memoBox.x + 70, memoBox.y + 30, { steps: 8 });
  await page.mouse.up();
  await expect(memoRow).toHaveClass(/is-actions-open/);
  await expect(memoRow).not.toHaveClass(/is-expanded/);
  await expect(memoRow.getByRole("button", { name: "パス" })).toBeVisible();
  await memoRow.locator(".m2-home__row-main").click();
  await expect(memoRow).toHaveClass(/is-expanded/);
  await expect(memoRow).not.toHaveClass(/is-actions-open/);
  const noMemoRow = page.locator(".m2-home__row").filter({ hasText: "今日中の家事" });
  await memoRow.locator(".m2-home__row-main").click();
  await noMemoRow.locator(".m2-home__row-main").click();
  await expect(noMemoRow.locator(".m2-home__primary")).toBeVisible();
  await expect(noMemoRow.getByText("メモ", { exact: true })).toHaveCount(0);
  await noMemoRow.locator(".m2-home__primary").click();
  await expect.poll(() => state.completeCalls ?? 0).toBe(1);
});

test("M2 Task add/reuse/edit/delete evidence", async ({ page }) => {
  const state: HomeState = { completed: false, passed: false, deleted: false };
  await installRoutes(page, state);
  await page.goto("/tasks/new");
  await expect(page.getByRole("heading", { name: "家事を追加" })).toBeVisible();
  await expect(page.locator(".bottom-nav")).toHaveCount(0);
  await expect(page.locator("input[type=\"date\"]")).toHaveCount(1);
  await expect(page.locator("#m2-task-start-date")).toBeVisible();
  await expect(page.getByRole("button", { name: "繰り返し: 今回だけ" })).toBeVisible();
  await expect(page.locator("#m2-task-date")).toHaveCount(0);
  await expect(page.locator("#m2-task-time")).toHaveCount(0);
  await page.getByRole("checkbox", { name: "終日" }).click();
  await expect(page.locator("#m2-task-time")).toBeVisible();
  await expect(page.locator("#m2-task-date")).toHaveCount(0);
  await screenshot(page, "08-task-add-390x844.png");
  await page.locator(".m2-task-form__actions").scrollIntoViewIfNeeded();
  await page.waitForTimeout(240);
  await screenshot(page, "12-task-add-bottom-390x844.png");
  await page.locator(".m2-task-form__reuse-trigger").scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: "以前の項目から選ぶ" }).click();
  await expect(page.getByRole("dialog", { name: "以前の項目から選ぶ" })).toBeVisible();
  await page.waitForTimeout(300);
  await screenshot(page, "09-task-reuse-picker-390x844.png");
  await page.getByRole("button", { name: /床そうじ/ }).click();
  await expect(page.getByRole("button", { name: "繰り返し: 毎日" })).toBeVisible();
  await page.goto("/tasks/task-edit/edit");
  await expect(page.getByRole("heading", { name: "家事を編集" })).toBeVisible();
  await expect(page.locator(".bottom-nav")).toHaveCount(0);
  await expect(page.locator("#m2-task-title")).toHaveValue("編集する家事");
  await expect(page.getByText("前回：8/20")).toBeVisible();
  await page.getByRole("button", { name: /繰り返し:/ }).click();
  await expect(page.getByRole("dialog", { name: "繰り返し" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "繰り返し" }).getByRole("button", { name: "毎日" }).locator("svg")).toHaveCount(1);
  await page.waitForTimeout(240);
  await screenshot(page, "14-task-repeat-sheet-390x844.png");
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.getByRole("button", { name: /担当:/ }).click();
  await expect(page.getByRole("dialog", { name: "担当" })).toBeVisible();
  await page.waitForTimeout(240);
  await screenshot(page, "15-task-assignee-sheet-390x844.png");
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await screenshot(page, "10-task-edit-last-completion-390x844.png");
  await page.locator(".m2-task-form__actions").scrollIntoViewIfNeeded();
  await page.waitForTimeout(240);
  await screenshot(page, "13-task-edit-bottom-390x844.png");
  await page.getByRole("button", { name: "この家事を削除" }).click();
  const deleteDialog = page.getByRole("dialog", { name: "家事を削除しますか？" });
  await expect(deleteDialog).toBeVisible();
  await expect(deleteDialog.getByText("この家事を削除します。")).toBeVisible();
  await expect(deleteDialog.getByRole("button", { name: "削除する" })).toBeVisible();
  await page.waitForTimeout(300);
  await screenshot(page, "11-task-delete-confirmation-390x844.png");
});

test("records task-complete.webm", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ja-JP", timezoneId: "Asia/Tokyo", recordVideo: { dir: evidenceDir, size: { width: 390, height: 844 } } });
  const page = await context.newPage();
  const state: HomeState = { completed: false, passed: false, deleted: false, overdue: true };
  await installRoutes(page, state);
  await page.goto("/home");
  await page.waitForTimeout(500);
  const taskRow = page.locator(".m2-home__row").first();
  await taskRow.getByRole("button", { name: "期限超過の家事の詳細" }).click();
  await taskRow.getByRole("button", { name: "完了" }).click();
  await page.waitForTimeout(550);
  await expect(page.getByText("期限超過の家事")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /完了済み 1/ })).toBeVisible();
  await copyVideo(page, "task-complete.webm");
});

test("records task-swipe-pass.webm", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ja-JP", timezoneId: "Asia/Tokyo", recordVideo: { dir: evidenceDir, size: { width: 390, height: 844 } } });
  const page = await context.newPage();
  const state: HomeState = { completed: false, passed: false, deleted: false, overdue: true };
  await installRoutes(page, state);
  await page.goto("/home");
  const row = page.locator(".m2-home__row").first();
  const box = await row.boundingBox();
  expect(box).not.toBeNull();
  await page.waitForTimeout(500);
  await page.mouse.move(box!.x + 190, box!.y + 30);
  await page.mouse.down();
  await page.mouse.move(box!.x + 70, box!.y + 30, { steps: 8 });
  await page.mouse.up();
  await row.getByRole("button", { name: "パス" }).click();
  await page.waitForTimeout(350);
  await expect(page.locator(".m2-home__task-title", { hasText: "期限超過の家事" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /パス済み 1/ })).toBeVisible();
  await copyVideo(page, "task-swipe-pass.webm");
});

test("records task-undo.webm", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ja-JP", timezoneId: "Asia/Tokyo", recordVideo: { dir: evidenceDir, size: { width: 390, height: 844 } } });
  const page = await context.newPage();
  const state: HomeState = { completed: true, passed: false, deleted: false, overdue: true, completedTaskId: "m2-overdue", completedTitle: "期限超過の家事" };
  await installRoutes(page, state);
  await page.goto("/home");
  await page.getByRole("button", { name: /完了済み 1/ }).click();
  const row = page.locator(".m2-home__history-list .m2-home__row");
  const box = await row.boundingBox();
  expect(box).not.toBeNull();
  await page.waitForTimeout(500);
  await page.mouse.move(box!.x + 190, box!.y + 30);
  await page.mouse.down();
  await page.mouse.move(box!.x + 80, box!.y + 30, { steps: 8 });
  await page.mouse.up();
  await page.getByRole("button", { name: "戻す" }).click();
  await page.waitForTimeout(350);
  await expect(page.getByRole("button", { name: "期限超過の家事の詳細" })).toBeVisible();
  await expect(page.getByRole("button", { name: /完了済み/ })).toHaveCount(0);
  await copyVideo(page, "task-undo.webm");
});

test("captures the M2 empty state", async ({ page }) => {
  const state: HomeState = { completed: false, passed: false, deleted: false, empty: true };
  await installRoutes(page, state);
  await page.goto("/home");
  await expect(page.getByText("やることはありません")).toBeVisible();
  await neutralize(page);
  await screenshot(page, "07-home-empty-390x844.png");
});
