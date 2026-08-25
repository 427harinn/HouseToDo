import { chromium } from "@playwright/test";
import fs from "node:fs/promises";

const production = process.env.M3_PRODUCTION_URL ?? "http://127.0.0.1:5173";
const mockup = process.env.M3_MOCKUP_URL ?? "http://127.0.0.1:5174";
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

const calendarMonthTasks = [
  { id: "calendar-aug-04", title: "資源ごみを出す", date: "2026-08-04", deadline: true },
  { id: "calendar-aug-09", title: "ベランダの植物に水をあげる", date: "2026-08-09", deadline: false },
  { id: "calendar-aug-12", title: "宅配便を受け取る", date: "2026-08-12", deadline: false },
  { id: "calendar-aug-16", title: "シーツを洗う", date: "2026-08-16", deadline: false },
  { id: "calendar-aug-20", title: "エアコンのフィルターを掃除", date: "2026-08-20", deadline: true },
  { id: "calendar-period-20", title: "今週のどこかでトイレ掃除", date: "2026-08-23", deadline: false },
  { id: "calendar-aug-23", title: "布団を干す", date: "2026-08-23", deadline: false },
  { id: "calendar-aug-27", title: "電池を交換する", date: "2026-08-27", deadline: true },
  { id: "calendar-aug-31", title: "家計簿を確認する", date: "2026-08-31", deadline: false },
  { id: "calendar-sep-14-1", title: "玄関を掃除する", date: "2026-09-14", deadline: false },
  { id: "calendar-sep-14-2", title: "洗濯槽を回す", date: "2026-09-14", deadline: false },
  { id: "calendar-sep-14-3", title: "調味料を補充する", date: "2026-09-14", deadline: false },
  { id: "calendar-sep-14-4", title: "書類を整理する", date: "2026-09-14", deadline: false }
];
const denseCalendarTasks = [
  { id: "calendar-dense-1", title: "洗濯物を取り込む", date: "2026-08-20", deadline: false },
  { id: "calendar-dense-2", title: "夕食の下ごしらえ", date: "2026-08-20", deadline: false },
  { id: "calendar-dense-3", title: "ゴミ袋を補充する", date: "2026-08-20", deadline: false },
  { id: "calendar-dense-4", title: "玄関を整える", date: "2026-08-20", deadline: false },
  { id: "calendar-dense-5", title: "冷蔵庫を確認する", date: "2026-08-23", deadline: false }
];
const nextDate = (date) => { const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + 1); return value.toISOString().slice(0, 10); };

function calendarPayload(selectedDate, state, from = "2026-07-26", to = "2026-09-05") {
  const dates = {};
  const monthTasks = [...calendarMonthTasks, ...(state.dense ? denseCalendarTasks : [])];
  const shoppingCounts = state.shopping ? { "2026-08-20": 1, "2026-08-23": 1, "2026-08-24": 1 } : {};
  for (let date = from; date <= to; date = nextDate(date)) {
    dates[date] = {
      fixedCount: monthTasks.filter((item) => item.date === date).length,
      fixedCompletedCount: 0,
      fixedSkippedCount: 0,
      shoppingCount: shoppingCounts[date] ?? 0,
      purchasedShoppingCount: 0,
      tasks: monthTasks.filter((item) => item.date === date).map(({ id, title, deadline }) => ({ id, title, deadline }))
    };
  }
  const completed = state.completed ? [{
    id: "record-1", taskId: "task-1", title: "朝食の片付け", taskActive: !state.deleted,
    selectedDate: "2026-08-20", actualCompleter: { userId: "user-1", displayName: "はる", avatarUrl: null },
    calendarActionDate: "2026-08-20", targetDate: "2026-08-20", targetWeekStart: null,
    occurrenceKey: "occurrence:task-1:2026-08-20", periodKey: null, status: "completed"
  }] : [];
  const direct = state.completed && !state.keepDirect ? [] : [task("task-aircon", "エアコンのフィルターを掃除", { targetDate: "2026-08-20", deadlineTime: "" })];
  return {
    from: "2026-07-26", to: "2026-09-05", today: "2026-08-20", timezone: "Asia/Tokyo", selectedDate,
    dates,
    selected: {
      fixed: direct,
      weeklyFlexible: [task("period-1", "今週のどこかでトイレ掃除", { modelRecurrenceType: "weekly_flexible", recurrenceType: "model_only", scopeKind: "period", targetDate: null, periodKey: "period:period-1:week:2026-08-17:2026-08-23", periodStart: "2026-08-17", periodEnd: "2026-08-23", deadlineDate: "2026-08-23" })],
      monthlyFlexible: [], completed,
      shopping: state.shopping && selectedDate === "2026-08-20" ? [{ id: "shopping-milk", name: "牛乳", quantity: "1本", note: "メモは非表示", status: "pending", plannedPurchaseDate: "2026-08-20", purchasedAt: null, purchasedBy: null }] : []
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
    if (url.pathname === "/api/tasks/calendar") return route.fulfill(json(calendarPayload(url.searchParams.get("selectedDate") ?? "2026-08-20", { ...state, completed }, url.searchParams.get("from") ?? undefined, url.searchParams.get("to") ?? undefined)));
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
  if (await page.locator(".calendar-date-sheet__content").count()) {
    await page.locator(".calendar-date-sheet__content").evaluate((element) => element.scrollTo({ top: 0, left: 0 }));
  }
  await page.screenshot({ path: `${evidence}/production/${name}.png`, fullPage: true });
  await context.close();
}

async function screenshotMockup(browser, name, state, extra = "", interact) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await page.goto(`${mockup}/#/calendar?uilabState=${state}${extra}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(250);
  await page.locator(".calendar-page").waitFor();
  if (interact) await interact(page);
  await page.evaluate("document.activeElement instanceof HTMLElement && document.activeElement.blur()");
  await page.mouse.move(1, 1);
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
await screenshotProduction(browser, "01-calendar-normal", { shopping: true }, "/calendar");
await screenshotProduction(browser, "02-calendar-dense", { dense: true, shopping: true }, "/calendar");
await screenshotProduction(browser, "03-calendar-shopping", { shopping: true }, "/calendar");
await screenshotProduction(browser, "04-calendar-date-open", { shopping: true }, "/calendar?date=2026-08-20");
await screenshotProduction(browser, "05-calendar-date-period-shopping", { period: true, shopping: true }, "/calendar?date=2026-08-20");
await screenshotProduction(browser, "06-calendar-completed-collapsed", { completed: true, keepDirect: true, shopping: true }, "/calendar?date=2026-08-20");
await screenshotProduction(browser, "07-calendar-completed-open", { completed: true, keepDirect: true, shopping: true }, "/calendar?date=2026-08-20", async (page) => page.getByRole("button", { name: /完了済み/ }).click());
await screenshotProduction(browser, "08-calendar-completed-swipe", { completed: true, keepDirect: true, shopping: true }, "/calendar?date=2026-08-20", async (page) => { await page.getByRole("button", { name: /完了済み/ }).click(); const row = page.locator(".calendar-history-row"); const box = await row.boundingBox(); if (!box) throw new Error("completed row missing"); await page.mouse.move(box.x + box.width - 16, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + 8, box.y + box.height / 2, { steps: 8 }); await page.mouse.up(); await page.getByRole("button", { name: "戻す" }).waitFor(); if (!(await page.getByRole("heading", { name: "8月20日 木曜日" }).isVisible())) throw new Error("completed swipe changed selected date"); });
await screenshotProduction(browser, "09-calendar-deleted-completed-restore-only", { completed: true, deleted: true, keepDirect: true, shopping: true }, "/calendar?date=2026-08-20", async (page) => { await page.getByRole("button", { name: /完了済み/ }).click(); const row = page.locator(".calendar-history-row"); const box = await row.boundingBox(); if (!box) throw new Error("deleted completed row missing"); await page.mouse.move(box.x + box.width - 16, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + 8, box.y + box.height / 2, { steps: 8 }); await page.mouse.up(); await page.getByRole("button", { name: "戻す" }).waitFor(); if (await page.getByRole("button", { name: "編集" }).count()) throw new Error("deleted completed row exposed edit action"); });
await screenshotProduction(browser, "10-calendar-after-restore", { completed: false, shopping: true }, "/calendar?date=2026-08-20");
await screenshotProduction(browser, "11-calendar-next-month", { shopping: true }, "/calendar", async (page) => { await page.getByRole("button", { name: "次の月" }).click(); await page.getByRole("heading", { name: "2026年9月" }).waitFor(); await page.evaluate("document.activeElement instanceof HTMLElement && document.activeElement.blur()"); await page.mouse.move(1, 1); });
await screenshotProduction(browser, "12-calendar-task-edit-return-context", { shopping: false }, "/calendar?date=2026-08-20");
await screenshotMockup(browser, "01-calendar-normal", "normal");
await screenshotMockup(browser, "02-calendar-dense", "dense");
await screenshotMockup(browser, "03-calendar-shopping", "shopping");
await screenshotMockup(browser, "04-calendar-date-open", "normal", "&selectedDate=2026-08-20");
await screenshotMockup(browser, "05-calendar-date-period-shopping", "date-open-shopping", "&selectedDate=2026-08-20");
await screenshotMockup(browser, "06-calendar-completed-collapsed", "completed-collapsed", "&selectedDate=2026-08-20");
await screenshotMockup(browser, "07-calendar-completed-open", "completed-open", "&selectedDate=2026-08-20");
await screenshotMockup(browser, "08-calendar-completed-swipe", "completed-swipe", "&selectedDate=2026-08-20");
await screenshotMockup(browser, "09-calendar-deleted-completed-restore-only", "deleted-completed-swipe", "&selectedDate=2026-08-20");
await screenshotMockup(browser, "10-calendar-after-restore", "completed-restore", "&selectedDate=2026-08-20");
await screenshotMockup(browser, "11-calendar-next-month", "normal", "", async (page) => { await page.getByRole("button", { name: "次の月" }).click(); await page.getByRole("heading", { name: "2026年9月" }).waitFor(); });
await recordMotion(browser, "calendar-task-complete", { shopping: false }, "/calendar?date=2026-08-20", async (page) => { await page.locator(".calendar-detail-task").first().click(); });
await recordMotion(browser, "calendar-month-swipe", { shopping: false }, "/calendar", async (page) => { const grid = page.locator(".calendar-month-grid"); const box = await grid.boundingBox(); if (!box) throw new Error("month grid missing"); await page.mouse.move(box.x + 180, box.y + 260); await page.mouse.down(); await page.mouse.move(box.x + 90, box.y + 260, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(250); await page.mouse.move(box.x + 90, box.y + 260); await page.mouse.down(); await page.mouse.move(box.x + 180, box.y + 260, { steps: 8 }); await page.mouse.up(); });
await recordMotion(browser, "calendar-day-swipe", { shopping: false }, "/calendar?date=2026-08-20", async (page) => { const sheet = page.locator(".calendar-date-sheet"); const box = await sheet.boundingBox(); if (!box) throw new Error("date sheet missing"); await page.mouse.move(box.x + 180, box.y + 400); await page.mouse.down(); await page.mouse.move(box.x + 90, box.y + 400, { steps: 8 }); await page.mouse.up(); });
}
if (!process.env.M3_ONLY_EDIT) await recordMotion(browser, "calendar-completed-undo", { completed: true, keepDirect: true, shopping: true }, "/calendar?date=2026-08-20", async (page) => { await page.getByRole("button", { name: /完了済み/ }).click(); const row = page.locator(".calendar-history-row"); const box = await row.boundingBox(); if (!box) throw new Error("completed row missing"); await page.mouse.move(box.x + box.width - 16, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + 8, box.y + box.height / 2, { steps: 8 }); await page.mouse.up(); await page.getByRole("button", { name: "戻す" }).click(); await page.locator(".calendar-detail-task").first().waitFor(); });
if (process.env.M3_ONLY_EDIT) {
  await screenshotProduction(browser, "12-calendar-task-edit-return-context", { shopping: false }, "/calendar?date=2026-08-20", async (page) => {
    await page.goto(`${production}/tasks/task-1/edit?origin=calendar&calendarDate=2026-08-20`, { waitUntil: "networkidle" });
    await page.locator("main.m2-task-form-page").waitFor();
  });
}
await browser.close();
