import { chromium } from "@playwright/test";
import fs from "node:fs/promises";

const production = "http://127.0.0.1:5173";
const mockup = "http://127.0.0.1:5174";
const evidence = new URL("../docs/evidence/m3/", import.meta.url).pathname.replace(/^\//, "");
const envelope = (data) => ({ ok: true, data, requestId: "m3-evidence" });
const json = (data) => ({ status: 200, contentType: "application/json", body: JSON.stringify(envelope(data)) });

const task = (id, title, overrides = {}) => ({
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
  startDate: "2026-08-01",
  targetDate: "2026-08-20",
  deadlineTime: null,
  notificationOffsetMinutes: null,
  active: true,
  sortOrder: 1,
  createdBy: "user-1",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  status: "pending",
  actedBy: null,
  startedAt: null,
  completedAt: null,
  skippedAt: null,
  note: null,
  scopeKind: "occurrence",
  occurrenceKey: `occurrence:${id}:2026-08-20`,
  periodKey: null,
  periodStart: "2026-08-20",
  periodEnd: "2026-08-20",
  deadlineDate: "2026-08-20",
  overdue: false,
  ...overrides
});

function calendarPayload(selectedDate, state) {
  const dates = {};
  const start = new Date("2026-08-01T00:00:00Z");
  for (let index = 0; index < 42; index += 1) {
    const day = new Date(start);
    day.setUTCDate(day.getUTCDate() + index);
    const date = day.toISOString().slice(0, 10);
    dates[date] = {
      fixedCount: date === "2026-08-20" ? 3 : 0,
      fixedCompletedCount: 0,
      fixedSkippedCount: 0,
      shoppingCount: date === "2026-08-20" ? 2 : 0,
      purchasedShoppingCount: 0,
      tasks: date === "2026-08-20" ? [
        { id: "task-1", title: "朝食の片付け", deadline: false },
        { id: "task-2", title: "長い名前の家事を省略表示する", deadline: true },
        { id: "task-3", title: "+Nのテスト用タスク", deadline: true }
      ] : []
    };
  }
  const completed = state.completed ? [{
    id: "record-1", taskId: "task-1", title: "朝食の片付け", taskActive: true,
    selectedDate: "2026-08-20", actualCompleter: { userId: "user-1", displayName: "はる", avatarUrl: null },
    calendarActionDate: "2026-08-20", targetDate: "2026-08-20", targetWeekStart: null,
    occurrenceKey: "occurrence:task-1:2026-08-20", periodKey: null, status: "completed"
  }] : [];
  const direct = state.completed ? [] : [task("task-1", "朝食の片付け"), task("task-2", "長い名前の家事を省略表示する", { sortOrder: 2, targetDate: "2026-08-20" })];
  return {
    from: "2026-07-26", to: "2026-09-05", today: "2026-08-20", timezone: "Asia/Tokyo", selectedDate,
    dates,
    selected: {
      fixed: direct,
      weeklyFlexible: state.period ? [task("period-1", "週内に完了する家事", { modelRecurrenceType: "weekly_flexible", recurrenceType: "model_only", scopeKind: "period", periodKey: "period:period-1:week:2026-08-17:2026-08-23", deadlineDate: "2026-08-23" })] : [],
      monthlyFlexible: [], completed,
      shopping: state.shopping ? [{ id: "shopping-1", name: "牛乳", quantity: "2本", note: "メモは非表示", status: "pending", plannedPurchaseDate: "2026-08-20", purchasedAt: null, purchasedBy: null }] : []
    }
  };
}

async function mockProduction(page, state) {
  let completed = state.completed;
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/auth/me") return route.fulfill(json({ user: { id: "user-1", email: "evidence@example.com", displayName: "はる", avatarUrl: null } }));
    if (url.pathname === "/api/households/current") return route.fulfill(json({ household: { id: "house-1", name: "Evidence House", timezone: "Asia/Tokyo", weekStartsOn: 0, role: "owner" } }));
    if (url.pathname === "/api/households/current/members") return route.fulfill(json({ members: [] }));
    if (url.pathname === "/api/tasks/task-1") return route.fulfill(json({ task: task("task-1", "朝食の片付け") }));
    if (url.pathname === "/api/tasks/task-1/history") return route.fulfill(json({ records: [] }));
    if (url.pathname === "/api/tasks/recent") return route.fulfill(json({ tasks: [] }));
    if (url.pathname === "/api/task-templates") return route.fulfill(json({ templates: [] }));
    if (url.pathname === "/api/tasks/calendar") return route.fulfill(json(calendarPayload(url.searchParams.get("selectedDate") ?? "2026-08-20", { ...state, completed })));
    if (url.pathname.endsWith("/complete")) { completed = true; return route.fulfill(json({ result: {} })); }
    if (url.pathname.endsWith("/calendar-restore")) { completed = false; return route.fulfill(json({ result: { reset: true } })); }
    return route.fulfill(json({}));
  });
}

async function screenshotProduction(browser, name, state, url, interact) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on("pageerror", (error) => console.log("pageerror", name, error.message));
  page.on("console", (message) => { if (message.type() === "error") console.log("console-error", name, message.text()); });
  await mockProduction(page, state);
  await page.goto(`${production}${url}`, { waitUntil: "networkidle" });
  console.log("production", name, page.url(), (await page.locator("body").innerText()).slice(0, 240));
  await page.locator(".calendar-page").waitFor();
  if (interact) await interact(page);
  await page.screenshot({ path: `${evidence}/production/${name}.png`, fullPage: true });
  await context.close();
}

async function screenshotMockup(browser, name, state, extra = "") {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await page.goto(`${mockup}/#/calendar?uilabState=${state}${extra}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(250);
  await page.locator(".calendar-page").waitFor();
  await page.screenshot({ path: `${evidence}/mockup/${name}.png`, fullPage: true });
  await page.close();
}

async function recordMotion(browser, name, state, url, interact) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, recordVideo: { dir: `${evidence}/motion`, size: { width: 390, height: 844 } } });
  const page = await context.newPage();
  await mockProduction(page, state);
  await page.goto(`${production}${url}`, { waitUntil: "networkidle" });
  await page.locator(".calendar-page").waitFor();
  await page.waitForTimeout(700);
  await interact(page);
  await page.waitForTimeout(700);
  const video = page.video();
  await context.close();
  if (video) await video.saveAs(`${evidence}/motion/${name}.webm`);
}

await fs.mkdir(`${evidence}/production`, { recursive: true });
await fs.mkdir(`${evidence}/mockup`, { recursive: true });
await fs.mkdir(`${evidence}/motion`, { recursive: true });
const browser = await chromium.launch({ headless: true });
if (!process.env.M3_ONLY_UNDO && !process.env.M3_ONLY_EDIT) {
await screenshotProduction(browser, "01-calendar-normal", { shopping: false }, "/calendar");
await screenshotProduction(browser, "02-calendar-dense", { shopping: false }, "/calendar?date=2026-08-20");
await screenshotProduction(browser, "03-calendar-shopping", { shopping: true }, "/calendar");
await screenshotProduction(browser, "04-calendar-date-open", { shopping: false }, "/calendar?date=2026-08-20");
await screenshotProduction(browser, "05-calendar-date-period-shopping", { period: true, shopping: true }, "/calendar?date=2026-08-20");
await screenshotProduction(browser, "06-calendar-completed-collapsed", { completed: true }, "/calendar?date=2026-08-20");
await screenshotProduction(browser, "07-calendar-completed-open", { completed: true }, "/calendar?date=2026-08-20", async (page) => page.getByRole("button", { name: /完了済み/ }).click());
await screenshotProduction(browser, "08-calendar-completed-swipe", { completed: true }, "/calendar?date=2026-08-20", async (page) => { await page.getByRole("button", { name: /完了済み/ }).click(); const row = page.locator(".calendar-history-row"); await row.hover(); await page.mouse.down(); await page.mouse.move(250, 500, { steps: 4 }); await page.mouse.up(); });
await screenshotProduction(browser, "09-calendar-deleted-completed-restore-only", { completed: true }, "/calendar?date=2026-08-20", async (page) => page.getByRole("button", { name: /完了済み/ }).click());
await screenshotProduction(browser, "10-calendar-after-restore", { completed: false }, "/calendar?date=2026-08-20");
await screenshotProduction(browser, "11-calendar-next-month", { shopping: false }, "/calendar", async (page) => page.getByRole("button", { name: "次の月" }).click());
await screenshotProduction(browser, "12-calendar-task-edit-return-context", { shopping: false }, "/calendar?date=2026-08-20");
await screenshotMockup(browser, "01-calendar-normal", "normal");
await screenshotMockup(browser, "02-calendar-dense", "long-text");
await screenshotMockup(browser, "03-calendar-shopping", "shopping");
await screenshotMockup(browser, "04-calendar-date-open", "normal", "&selectedDate=2026-08-20");
await screenshotMockup(browser, "05-calendar-date-period-shopping", "date-open-shopping", "&selectedDate=2026-08-20");
await screenshotMockup(browser, "06-calendar-completed-collapsed", "completed-collapsed", "&selectedDate=2026-08-20");
await screenshotMockup(browser, "07-calendar-completed-open", "completed-open", "&selectedDate=2026-08-20");
await screenshotMockup(browser, "08-calendar-completed-swipe", "completed-swipe", "&selectedDate=2026-08-20");
await screenshotMockup(browser, "09-calendar-deleted-completed-restore-only", "deleted-completed", "&selectedDate=2026-08-20");
await screenshotMockup(browser, "10-calendar-after-restore", "normal", "&selectedDate=2026-08-20");
await screenshotMockup(browser, "11-calendar-next-month", "normal");
await recordMotion(browser, "calendar-task-complete", { shopping: false }, "/calendar?date=2026-08-20", async (page) => { await page.locator(".calendar-detail-task").first().click(); });
await recordMotion(browser, "calendar-month-swipe", { shopping: false }, "/calendar", async (page) => { const grid = page.locator(".calendar-month-grid"); const box = await grid.boundingBox(); if (!box) throw new Error("month grid missing"); await page.mouse.move(box.x + 180, box.y + 260); await page.mouse.down(); await page.mouse.move(box.x + 90, box.y + 260, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(250); await page.mouse.move(box.x + 90, box.y + 260); await page.mouse.down(); await page.mouse.move(box.x + 180, box.y + 260, { steps: 8 }); await page.mouse.up(); });
await recordMotion(browser, "calendar-day-swipe", { shopping: false }, "/calendar?date=2026-08-20", async (page) => { const sheet = page.locator(".calendar-date-sheet"); const box = await sheet.boundingBox(); if (!box) throw new Error("date sheet missing"); await page.mouse.move(box.x + 180, box.y + 400); await page.mouse.down(); await page.mouse.move(box.x + 90, box.y + 400, { steps: 8 }); await page.mouse.up(); });
}
if (!process.env.M3_ONLY_EDIT) await recordMotion(browser, "calendar-completed-undo", { completed: true }, "/calendar?date=2026-08-20", async (page) => { await page.getByRole("button", { name: /完了済み/ }).click(); const row = page.locator(".calendar-history-row"); await row.locator(".m2-home__more").dispatchEvent("click"); await row.locator(".m2-home__actions .is-secondary").dispatchEvent("click"); });
if (process.env.M3_ONLY_EDIT) {
  await screenshotProduction(browser, "12-calendar-task-edit-return-context", { shopping: false }, "/calendar?date=2026-08-20", async (page) => {
    await page.goto(`${production}/tasks/task-1/edit?origin=calendar&calendarDate=2026-08-20`, { waitUntil: "networkidle" });
    await page.locator("main.m2-task-form-page").waitFor();
  });
}
await browser.close();
