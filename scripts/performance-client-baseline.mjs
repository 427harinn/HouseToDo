/* global MutationObserver, Request, document, performance, setTimeout, window */

import { chromium } from "@playwright/test";

const baseUrl = process.env.PERF_BASE_URL ?? "http://127.0.0.1:8787";
const responseEnvelope = (data) => ({ ok: true, data, requestId: "performance-client-baseline" });
const performanceDate = process.env.PERF_DATE ?? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());
const performanceDateTime = `${performanceDate}T00:00:00.000Z`;

const task = {
  id: "task-1",
  title: "Performance task",
  description: null,
  recurrenceType: "daily",
  modelRecurrenceType: "daily",
  assignmentType: "anyone",
  assignment: { type: "anyone", user: null },
  assignedUserId: null,
  scheduledTime: null,
  notificationSlot: "none",
  notificationTime: null,
  weekdays: [],
  weeklyTargetCount: null,
  startDate: performanceDate,
  targetDate: null,
  deadlineTime: null,
  notificationOffsetMinutes: null,
  weeklyDeadlineWeekday: null,
  monthlyDayOfMonth: null,
  monthlyDeadlineDay: null,
  monthlyDeadlineType: null,
  active: true,
  sortOrder: 1,
  createdBy: "user-1",
  createdAt: performanceDateTime,
  updatedAt: performanceDateTime,
  status: "pending",
  actedBy: null,
  startedAt: null,
  completedAt: null,
  skippedAt: null,
  note: null,
  scopeKind: "occurrence",
  occurrenceKey: `daily:${performanceDate}`,
  periodKey: null,
  periodStart: null,
  periodEnd: null,
  deadlineDate: performanceDate,
  completedCount: 0,
  overdue: false
};

const completedRecord = {
  id: "record-1",
  taskId: task.id,
  targetDate: performanceDate,
  targetWeekStart: null,
  occurrenceKey: task.occurrenceKey,
  periodKey: null,
  status: "completed",
  title: task.title,
  taskActive: true,
  actualCompleter: { userId: "user-1", displayName: "Performance", avatarUrl: null },
  assignedUser: null,
  completedAt: performanceDateTime,
  skippedAt: null,
  createdAt: performanceDateTime,
  updatedAt: performanceDateTime
};

const homeData = (completed) => ({
  date: performanceDate,
  homeTasks: completed ? [] : [task],
  completedRecords: completed ? [completedRecord] : [],
  passedRecords: [],
  shopping: { pendingCount: 0 },
  members: []
});

const createMockPage = async (browser) => {
  const page = await browser.newPage();
  await page.addInitScript(() => {
    window.__performanceBaseline = [{ kind: "document-start", at: performance.now() }];
    const markDom = () => {
      if (document.querySelector(".m2-home__task-title") && !window.__performanceBaseline.some((mark) => mark.kind === "dom-task-visible")) {
        window.__performanceBaseline.push({ kind: "dom-task-visible", at: performance.now() });
      }
      if (document.querySelector(".m2-home__history--completed") && !window.__performanceBaseline.some((mark) => mark.kind === "dom-completed-visible")) {
        window.__performanceBaseline.push({ kind: "dom-completed-visible", at: performance.now() });
      }
    };
    new MutationObserver(markDom).observe(document, { childList: true, subtree: true });
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : input.url;
      const path = new URL(url, window.location.origin).pathname;
      const start = performance.now();
      window.__performanceBaseline.push({ kind: "fetch-start", path, at: start });
      const response = await nativeFetch(input, init);
      window.__performanceBaseline.push({ kind: "fetch-response", path, status: response.status, at: performance.now() });
      return response;
    };
  });
  let completed = false;
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    let data;
    let delay = 0;
    if (path === "/api/auth/me") {
      delay = 25;
      data = { user: { id: "user-1", email: "performance@example.invalid", displayName: "Performance", avatarUrl: null } };
    } else if (path === "/api/households/current") {
      delay = 30;
      data = { household: { id: "household-1", name: "Performance House", timezone: "Asia/Tokyo", weekStartsOn: 1, role: "owner" } };
    } else if (path === "/api/home/today") {
      delay = 60;
      data = homeData(completed);
    } else if (path === "/api/tasks/task-1/complete" && method === "POST") {
      delay = 45;
      completed = true;
      data = { result: { ...task, status: "completed" } };
    } else if (path === "/api/tasks/calendar/range") {
      delay = 35;
      data = { from: performanceDate, to: performanceDate, today: performanceDate, timezone: "Asia/Tokyo", dates: {} };
    } else if (path === "/api/tasks/calendar/day") {
      delay = 35;
      data = { today: performanceDate, timezone: "Asia/Tokyo", selectedDate: performanceDate, selected: { fixed: [], weeklyFlexible: [], monthlyFlexible: [], completed: [], shopping: [] } };
    } else if (path === "/api/shopping/items") {
      delay = 35;
      data = { pending: [], purchased: [] };
    } else if (path === "/api/shopping/templates") {
      delay = 35;
      data = { templates: [] };
    } else if (path === "/api/households/current/members") {
      delay = 35;
      data = { members: [] };
    } else {
      await route.continue();
      return;
    }
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(responseEnvelope(data)) });
  });
  return { page, getCompleted: () => completed };
};

const pathOf = (url) => new URL(url).pathname;
const collectEvents = (page) => {
  const events = [];
  page.on("request", (request) => {
    const path = pathOf(request.url());
    if (path.startsWith("/api/")) events.push({ type: "request", path, method: request.method(), at: performance.now() });
  });
  page.on("response", (response) => {
    const path = pathOf(response.url());
    if (path.startsWith("/api/")) events.push({ type: "response", path, method: response.request().method(), at: performance.now() });
  });
  return events;
};

const eventAt = (events, type, path, method = "GET", occurrence = 0) => events.filter((event) => event.type === type && event.path === path && event.method === method)[occurrence];
const diff = (a, b) => Number((b - a).toFixed(2));
const aggregate = (rows, key) => {
  const values = rows.map((row) => row[key]).sort((a, b) => a - b);
  return { min: values[0], p50: values[Math.floor(values.length * 0.5)], p95: values[Math.min(values.length - 1, Math.ceil(values.length * 0.95) - 1)], max: values.at(-1) };
};

const browser = await chromium.launch({ headless: true });
const fresh = [];
for (let index = 0; index < 10; index += 1) {
  const { page } = await createMockPage(browser);
  const events = collectEvents(page);
  const navigationStart = performance.now();
  await page.goto(`${baseUrl}/home`);
  await page.getByRole("button", { name: "Performance taskの詳細" }).waitFor({ state: "visible" });
  const taskVisible = performance.now();
  const pageMarks = await page.evaluate(() => window.__performanceBaseline);
  const authStart = eventAt(events, "request", "/api/auth/me");
  const authResponse = eventAt(events, "response", "/api/auth/me");
  const householdStart = eventAt(events, "request", "/api/households/current");
  const householdResponse = eventAt(events, "response", "/api/households/current");
  const homeStart = eventAt(events, "request", "/api/home/today");
  fresh.push({
    navigationToHomeStart: diff(navigationStart, homeStart.at),
    authToResponse: diff(authStart.at, authResponse.at),
    householdWaitAfterAuth: diff(authResponse.at, householdStart.at),
    householdToResponse: diff(householdStart.at, householdResponse.at),
    homeToResponse: diff(
      pageMarks.find((mark) => mark.kind === "fetch-start" && mark.path === "/api/home/today").at,
      pageMarks.find((mark) => mark.kind === "fetch-response" && mark.path === "/api/home/today").at
    ),
    homeResponseToTaskVisible: diff(
      pageMarks.find((mark) => mark.kind === "fetch-response" && mark.path === "/api/home/today").at,
      pageMarks.find((mark) => mark.kind === "dom-task-visible").at
    ),
    navigationToTaskVisible: diff(navigationStart, taskVisible)
  });
  await page.close();
}

const completionSamples = [];
for (let index = 0; index < 10; index += 1) {
  const completePage = await createMockPage(browser);
  await completePage.page.goto(`${baseUrl}/home`);
  const row = completePage.page.getByRole("button", { name: "Performance taskの詳細" });
  await row.waitFor({ state: "visible" });
  await row.click();
  const completeButton = completePage.page.getByRole("button", { name: "完了", exact: true });
  await completePage.page.evaluate(() => {
    const at = performance.now();
    window.__performanceBaseline.push({ kind: "complete-click", at });
  });
  await completeButton.dispatchEvent("click");
  await completePage.page.locator(".m2-home__history--completed").waitFor({ state: "visible" });
  const completeMarks = await completePage.page.evaluate(() => window.__performanceBaseline);
  const completeClickMark = completeMarks.find((mark) => mark.kind === "complete-click");
  const completeStartMark = completeMarks.find((mark) => mark.kind === "fetch-start" && mark.path === "/api/tasks/task-1/complete");
  const completeResponseMark = completeMarks.find((mark) => mark.kind === "fetch-response" && mark.path === "/api/tasks/task-1/complete");
  const refreshStartMark = completeMarks.filter((mark) => mark.kind === "fetch-start" && mark.path === "/api/home/today")[1];
  const refreshResponseMark = completeMarks.filter((mark) => mark.kind === "fetch-response" && mark.path === "/api/home/today")[1];
  const completedDomMark = completeMarks.find((mark) => mark.kind === "dom-completed-visible");
  completionSamples.push({
    clickToPostStart: diff(completeClickMark.at, completeStartMark.at),
    clickToPostResponse: diff(completeClickMark.at, completeResponseMark.at),
    postResponseToRefreshStart: diff(completeResponseMark.at, refreshStartMark.at),
    refreshToResponse: diff(refreshStartMark.at, refreshResponseMark.at),
    responseToCompletedSectionVisible: diff(refreshResponseMark.at, completedDomMark.at),
    clickToCompletedSectionVisible: diff(completeClickMark.at, completedDomMark.at)
  });
  await completePage.page.close();
}
const completion = { samples: completionSamples.length, phases: Object.fromEntries(Object.keys(completionSamples[0]).map((key) => [key, aggregate(completionSamples, key)])) };

const navigationPage = await createMockPage(browser);
const navigationEvents = collectEvents(navigationPage.page);
await navigationPage.page.goto(`${baseUrl}/home`);
await navigationPage.page.getByRole("button", { name: "Performance taskの詳細" }).waitFor({ state: "visible" });
await navigationPage.page.getByRole("button", { name: "カレンダー" }).click();
await navigationPage.page.locator(".calendar-page").waitFor({ state: "visible" });
await navigationPage.page.waitForFunction(() => window.__performanceBaseline.some((mark) => mark.kind === "fetch-response" && ["/api/tasks/calendar/range", "/api/tasks/calendar/day"].includes(mark.path)));
await navigationPage.page.getByRole("button", { name: "ホーム" }).click();
await navigationPage.page.getByRole("button", { name: "Performance taskの詳細" }).waitFor({ state: "visible" });
await navigationPage.page.getByRole("button", { name: "買い物", exact: true }).click();
await navigationPage.page.locator(".shopping-m4").waitFor({ state: "visible" });
await navigationPage.page.waitForFunction(() => ["/api/shopping/items", "/api/shopping/templates", "/api/households/current/members"].every((path) => window.__performanceBaseline.some((mark) => mark.kind === "fetch-response" && mark.path === path)));
await navigationPage.page.getByRole("button", { name: "ホーム" }).click();
await navigationPage.page.getByRole("button", { name: "Performance taskの詳細" }).waitFor({ state: "visible" });
const requestCounts = Object.fromEntries(["/api/auth/me", "/api/households/current", "/api/home/today", "/api/tasks/calendar/range", "/api/tasks/calendar/day", "/api/shopping/items", "/api/shopping/templates", "/api/households/current/members"].map((path) => [path, navigationEvents.filter((event) => event.type === "request" && event.path === path).length]));
const requestDurations = Object.fromEntries(Object.keys(requestCounts).map((path) => {
  const starts = navigationEvents.filter((event) => event.type === "request" && event.path === path);
  const responses = navigationEvents.filter((event) => event.type === "response" && event.path === path);
  return [path, starts.flatMap((start, index) => responses[index] ? [Number((responses[index].at - start.at).toFixed(2))] : [])];
}));

console.log(JSON.stringify({
  controlledDelaysMs: { auth: 25, household: 30, home: 60, completePost: 45 },
  freshLoad: { samples: fresh.length, phases: Object.fromEntries(Object.keys(fresh[0]).map((key) => [key, aggregate(fresh, key)])) },
  completion,
  navigationRequestCounts: requestCounts,
  navigationRequestDurationsMs: requestDurations,
  note: "Response-to-DOM excludes CSS animation duration; completion includes the existing motion gate while the Home refresh is overlapped after POST success."
}, null, 2));

await navigationPage.page.close();
await browser.close();
