/* global MutationObserver, Request, document, performance, setTimeout, window */

import { chromium } from "@playwright/test";

const baseUrl = process.env.PERF_BASE_URL ?? "http://127.0.0.1:5174";
const responseEnvelope = (data) => ({ ok: true, data, requestId: "calendar-performance-baseline" });

const task = (date, id = "calendar-task") => ({
  id,
  title: `Calendar task ${date}`,
  description: "calendar performance task",
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
  startDate: date,
  targetDate: date,
  deadlineTime: null,
  notificationOffsetMinutes: null,
  weeklyDeadlineWeekday: null,
  monthlyDayOfMonth: null,
  monthlyDeadlineDay: null,
  monthlyDeadlineType: null,
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
  occurrenceKey: `daily:${date}`,
  periodKey: null,
  periodStart: null,
  periodEnd: null,
  deadlineDate: date,
  completedCount: 0,
  overdue: false
});

const dateKeys = (from, to) => {
  const keys = [];
  for (let date = new Date(`${from}T00:00:00Z`); date <= new Date(`${to}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + 1)) {
    keys.push(date.toISOString().slice(0, 10));
  }
  return keys;
};

const calendarData = (from, to, selectedDate, completed) => {
  const keys = dateKeys(from, to);
  const visibleMonth = keys.find((date) => date.slice(0, 7) !== from.slice(0, 7))?.slice(0, 7) ?? from.slice(0, 7);
  const markerDate = `${visibleMonth}-15`;
  const dates = Object.fromEntries(keys.map((date) => [date, {
    fixedCount: (date === selectedDate || date === markerDate) && !completed ? 1 : 0,
    fixedCompletedCount: (date === selectedDate || date === markerDate) && completed ? 1 : 0,
    fixedSkippedCount: 0,
    shoppingCount: date === selectedDate ? 1 : 0,
    purchasedShoppingCount: 0,
    tasks: (date === selectedDate || date === markerDate) && !completed ? [{ id: "calendar-task", title: `Calendar task ${date}`, deadline: false }] : []
  }]));
  return {
    from,
    to,
    today: "2026-08-28",
    timezone: "Asia/Tokyo",
    selectedDate,
    dates,
    selected: {
      fixed: completed ? [] : [task(selectedDate)],
      weeklyFlexible: [],
      monthlyFlexible: [],
      completed: completed ? [{
        id: "calendar-record",
        taskId: "calendar-task",
        targetDate: selectedDate,
        targetWeekStart: null,
        occurrenceKey: `daily:${selectedDate}`,
        periodKey: null,
        status: "completed",
        title: `Calendar task ${selectedDate}`,
        taskActive: true,
        selectedDate,
        actualCompleter: { userId: "user-1", displayName: "Calendar Performance", avatarUrl: null },
        assignedUser: null,
        completedAt: "2026-08-28T00:00:00.000Z",
        skippedAt: null,
        createdAt: "2026-08-28T00:00:00.000Z",
        updatedAt: "2026-08-28T00:00:00.000Z"
      }] : [],
      shopping: selectedDate === "2026-08-28" ? [{ id: "shopping-1", name: "Calendar milk", quantity: "1", note: null, status: "pending", plannedPurchaseDate: selectedDate, purchasedAt: null, purchasedBy: null }] : []
    }
  };
};

const markerData = (data) => ({ from: data.from, to: data.to, today: data.today, timezone: data.timezone, dates: data.dates });
const selectedData = (data) => ({ today: data.today, timezone: data.timezone, selectedDate: data.selectedDate, selected: data.selected });

const homeData = () => ({
  date: "2026-08-28",
  homeTasks: [task("2026-08-28")],
  completedRecords: [],
  passedRecords: [],
  shopping: { pendingCount: 1 },
  members: []
});

const createMockPage = async (browser) => {
  const page = await browser.newPage();
  await page.clock.install({ time: new Date("2026-08-28T12:00:00+09:00") });
  await page.addInitScript(() => {
    window.__calendarBaseline = [{ kind: "document-start", at: performance.now() }];
    const mark = () => {
      if (document.querySelector(".calendar-month-grid") && !window.__calendarBaseline.some((item) => item.kind === "month-grid-visible")) {
        window.__calendarBaseline.push({ kind: "month-grid-visible", at: performance.now() });
      }
      if (document.querySelector(".calendar-date-sheet__content") && !window.__calendarBaseline.some((item) => item.kind === "date-sheet-visible")) {
        window.__calendarBaseline.push({ kind: "date-sheet-visible", at: performance.now() });
      }
      if (document.querySelector(".calendar-day-task") && !window.__calendarBaseline.some((item) => item.kind === "month-data-visible")) {
        window.__calendarBaseline.push({ kind: "month-data-visible", at: performance.now() });
      }
      if (document.querySelector('.calendar-day-task[title="Calendar task 2026-09-15"]') && !window.__calendarBaseline.some((item) => item.kind === "next-month-data-visible")) {
        window.__calendarBaseline.push({ kind: "next-month-data-visible", at: performance.now() });
      }
      if (document.querySelector(".calendar-completed-section") && !window.__calendarBaseline.some((item) => item.kind === "completed-visible")) {
        window.__calendarBaseline.push({ kind: "completed-visible", at: performance.now() });
      }
    };
    new MutationObserver(mark).observe(document, { childList: true, subtree: true });
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : input.url;
      const path = new URL(url, window.location.origin).pathname;
      window.__calendarBaseline.push({ kind: "fetch-start", path, at: performance.now() });
      const response = await nativeFetch(input, init);
      window.__calendarBaseline.push({ kind: "fetch-response", path, status: response.status, at: performance.now() });
      return response;
    };
  });
  let completed = false;
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    let data;
    let delay = 0;
    if (path === "/api/auth/me") {
      data = { user: { id: "user-1", email: "calendar-performance@example.invalid", displayName: "Calendar Performance", avatarUrl: null } };
    } else if (path === "/api/households/current") {
      data = { household: { id: "household-1", name: "Calendar Performance House", timezone: "Asia/Tokyo", weekStartsOn: 1, role: "owner" } };
    } else if (path === "/api/home/today") {
      data = homeData();
    } else if (path === "/api/tasks/calendar/range") {
      delay = 60;
      data = markerData(calendarData(url.searchParams.get("from"), url.searchParams.get("to"), "2026-08-28", completed));
    } else if (path === "/api/tasks/calendar/day") {
      delay = 60;
      data = selectedData(calendarData(url.searchParams.get("date"), url.searchParams.get("date"), url.searchParams.get("date") ?? "2026-08-28", completed));
    } else if (path === "/api/tasks/calendar-task/complete" && method === "POST") {
      delay = 45;
      completed = true;
      data = { result: { ...task("2026-08-28"), status: "completed" } };
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
    if (pathOf(request.url()).startsWith("/api/")) events.push({ type: "request", path: pathOf(request.url()), method: request.method(), at: performance.now() });
  });
  page.on("response", (response) => {
    if (pathOf(response.url()).startsWith("/api/")) events.push({ type: "response", path: pathOf(response.url()), method: response.request().method(), at: performance.now() });
  });
  return events;
};
const diff = (a, b) => Number((b - a).toFixed(2));
const aggregate = (rows, key) => {
  const values = rows.map((row) => row[key]).sort((a, b) => a - b);
  return { min: values[0], p50: values[Math.floor(values.length * 0.5)], p95: values[Math.min(values.length - 1, Math.ceil(values.length * 0.95) - 1)], max: values.at(-1) };
};
const pageMark = (marks, kind, path, occurrence = 0) => marks.filter((mark) => mark.kind === kind && mark.path === path)[occurrence];

const browser = await chromium.launch({ headless: true });
const initialSamples = [];
const requestCounts = { coldDirectMarkers: [], dateTapSelected: [], monthChangeMarkers: [], actionRefreshMarkers: [], actionRefreshSelected: [], inAppHomeToCalendarMarkers: [] };
for (let index = 0; index < 10; index += 1) {
  const { page } = await createMockPage(browser);
  const events = collectEvents(page);
  const navigationStart = performance.now();
  await page.goto(`${baseUrl}/calendar`);
  await page.locator('.calendar-day-task[title="Calendar task 2026-08-28"]').waitFor({ state: "visible" });
  const gridVisible = performance.now();
  const marks = await page.evaluate(() => window.__calendarBaseline);
  const request = events.find((event) => event.type === "request" && event.path === "/api/tasks/calendar/range");
  const response = events.find((event) => event.type === "response" && event.path === "/api/tasks/calendar/range");
  const fetchResponse = pageMark(marks, "fetch-response", "/api/tasks/calendar/range");
  const gridMark = pageMark(marks, "month-data-visible", undefined);
  if (!request || !response || !fetchResponse || !gridMark) throw new Error(JSON.stringify({ events, marks }));
  requestCounts.coldDirectMarkers.push(events.filter((event) => event.type === "request" && event.path === "/api/tasks/calendar/range").length);
  initialSamples.push({
    navigationToRequestStart: diff(navigationStart, request.at),
    requestToResponse: diff(request.at, response.at),
    responseToMonthGridVisible: diff(fetchResponse.at, gridMark.at),
    navigationToMonthGridVisible: diff(navigationStart, gridVisible)
  });
  await page.close();
}

const inAppHomeToCalendarSamples = [];
for (let index = 0; index < 10; index += 1) {
  const { page } = await createMockPage(browser);
  const events = collectEvents(page);
  await page.goto(`${baseUrl}/home`);
  await page.locator('.m2-home__task-list .m2-home__task-title').first().waitFor({ state: "visible" });
  const calendarButton = page.getByRole("button", { name: "カレンダー" });
  await calendarButton.evaluate((button) => {
    button.addEventListener("click", () => {
      window.__calendarBaseline.push({ kind: "in-app-calendar-click", at: performance.now() });
    }, { capture: true, once: true });
  });
  await calendarButton.click();
  await page.locator('.calendar-day-task[title="Calendar task 2026-08-28"]').waitFor({ state: "visible" });
  const marks = await page.evaluate(() => window.__calendarBaseline);
  const clickMark = pageMark(marks, "in-app-calendar-click");
  const calendarStartMark = pageMark(marks, "fetch-start", "/api/tasks/calendar/range");
  const calendarResponseMark = pageMark(marks, "fetch-response", "/api/tasks/calendar/range");
  const monthDataMark = pageMark(marks, "month-data-visible");
  const authCount = events.filter((event) => event.type === "request" && event.path === "/api/auth/me").length;
  const householdCount = events.filter((event) => event.type === "request" && event.path === "/api/households/current").length;
  const calendarCount = events.filter((event) => event.type === "request" && event.path === "/api/tasks/calendar/range").length;
  if (!clickMark || !calendarStartMark || !calendarResponseMark || !monthDataMark) throw new Error(JSON.stringify({ marks, events }));
  requestCounts.inAppHomeToCalendarMarkers.push(calendarCount);
  inAppHomeToCalendarSamples.push({
    navigationToCalendarRequestStart: diff(clickMark.at, calendarStartMark.at),
    calendarRequestToResponse: diff(calendarStartMark.at, calendarResponseMark.at),
    calendarResponseToUsableDom: diff(calendarResponseMark.at, monthDataMark.at),
    navigationToUsableCalendar: diff(clickMark.at, monthDataMark.at),
    additionalAuthRequests: Math.max(0, authCount - 1),
    additionalHouseholdRequests: Math.max(0, householdCount - 1),
    markerRequests: calendarCount
  });
  await page.close();
}

const dateTapSamples = [];
for (let index = 0; index < 10; index += 1) {
  const { page } = await createMockPage(browser);
  const events = collectEvents(page);
  await page.goto(`${baseUrl}/calendar`);
  await page.locator('.calendar-day-task[title="Calendar task 2026-08-28"]').waitFor({ state: "visible" });
  const dateCell = page.locator('.calendar-day-cell[aria-label^="8月29日"]');
  await dateCell.evaluate((button) => {
    button.addEventListener("click", () => {
      window.__calendarBaseline.push({ kind: "date-tap-click", at: performance.now() });
    }, { capture: true, once: true });
  });
  await dateCell.click();
  await page.waitForResponse((response) => pathOf(response.url()) === "/api/tasks/calendar/day");
  await page.locator(".calendar-date-sheet .calendar-detail-task").first().waitFor({ state: "visible" });
  await page.evaluate(() => window.__calendarBaseline.push({ kind: "date-sheet-task-visible", at: performance.now() }));
  const marks = await page.evaluate(() => window.__calendarBaseline);
  const clickMark = pageMark(marks, "date-tap-click");
  const request = pageMark(marks, "fetch-start", "/api/tasks/calendar/day");
  const response = pageMark(marks, "fetch-response", "/api/tasks/calendar/day");
  const selectedVisible = pageMark(marks, "date-sheet-task-visible");
  requestCounts.dateTapSelected.push(events.filter((event) => event.type === "request" && event.path === "/api/tasks/calendar/day").length);
  if (!clickMark || !request || !response || !selectedVisible) throw new Error(JSON.stringify({ marks, events }));
  dateTapSamples.push({
    actualClickToRequestStart: diff(clickMark.at, request.at),
    requestToResponse: diff(request.at, response.at),
    responseToDateSheetTaskVisible: diff(response.at, selectedVisible.at),
    actualClickToDateSheetTaskVisible: diff(clickMark.at, selectedVisible.at)
  });
  await page.close();
}

const monthChangeSamples = [];
for (let index = 0; index < 10; index += 1) {
  const { page } = await createMockPage(browser);
  const events = collectEvents(page);
  await page.goto(`${baseUrl}/calendar`);
  await page.locator('.calendar-day-task[title="Calendar task 2026-08-28"]').waitFor({ state: "visible" });
  const nextMonthButton = page.getByRole("button", { name: "次の月" });
  await nextMonthButton.evaluate((button) => {
    button.addEventListener("click", () => {
      window.__calendarBaseline.push({ kind: "month-next-click", at: performance.now() });
    }, { capture: true, once: true });
  });
  await nextMonthButton.click();
  await page.waitForResponse((response) => pathOf(response.url()) === "/api/tasks/calendar/range");
  await page.locator('.calendar-day-task[title="Calendar task 2026-09-15"]').waitFor({ state: "visible" });
  const marks = await page.evaluate(() => window.__calendarBaseline);
  const clickMark = pageMark(marks, "month-next-click");
  const request = pageMark(marks, "fetch-start", "/api/tasks/calendar/range", 1);
  const response = pageMark(marks, "fetch-response", "/api/tasks/calendar/range", 1);
  const newMonthVisible = pageMark(marks, "next-month-data-visible");
  requestCounts.monthChangeMarkers.push(events.filter((event) => event.type === "request" && event.path === "/api/tasks/calendar/range").length - 1);
  if (!clickMark || !request || !response || !newMonthVisible) throw new Error(JSON.stringify({ marks, events }));
  monthChangeSamples.push({
    actualClickToRequestStart: diff(clickMark.at, request.at),
    requestToResponse: diff(request.at, response.at),
    responseToNewMonthVisible: diff(response.at, newMonthVisible.at),
    actualClickToNewMonthVisible: diff(clickMark.at, newMonthVisible.at)
  });
  await page.close();
}

const actionSamples = [];
for (let index = 0; index < 10; index += 1) {
  const { page } = await createMockPage(browser);
  const events = collectEvents(page);
  await page.goto(`${baseUrl}/calendar?date=2026-08-28`);
  const detail = page.locator(".calendar-detail-task").first();
  await detail.locator(".calendar-detail-task__main").click();
  const completeButton = detail.getByRole("button", { name: "完了" });
  await completeButton.evaluate((button) => {
    button.addEventListener("click", () => {
      window.__calendarBaseline.push({ kind: "complete-click", at: performance.now() });
    }, { capture: true, once: true });
  });
  await completeButton.click();
  await page.getByRole("button", { name: /完了済み 1/ }).waitFor({ state: "visible" });
  const marks = await page.evaluate(() => window.__calendarBaseline);
  const markerRequests = events.filter((event) => event.type === "request" && event.path === "/api/tasks/calendar/range");
  const selectedRequests = events.filter((event) => event.type === "request" && event.path === "/api/tasks/calendar/day");
  requestCounts.actionRefreshMarkers.push(markerRequests.length - 1);
  requestCounts.actionRefreshSelected.push(selectedRequests.length - 1);
  const clickMark = pageMark(marks, "complete-click", undefined);
  const postStartMark = pageMark(marks, "fetch-start", "/api/tasks/calendar-task/complete");
  const postResponseMark = pageMark(marks, "fetch-response", "/api/tasks/calendar-task/complete");
  const calendarFetchStarts = marks.filter((mark) => mark.kind === "fetch-start" && mark.path === "/api/tasks/calendar/range");
  const calendarFetchResponses = marks.filter((mark) => mark.kind === "fetch-response" && mark.path === "/api/tasks/calendar/range");
  const refreshStartMark = calendarFetchStarts.at(-1);
  const refreshResponseMark = calendarFetchResponses.at(-1);
  const completedVisibleMark = pageMark(marks, "completed-visible", undefined);
  if (!clickMark || !postStartMark || !postResponseMark || !refreshStartMark || !refreshResponseMark || !completedVisibleMark) throw new Error(JSON.stringify({ marks, markerRequests, selectedRequests }));
  actionSamples.push({
    clickToPostStart: diff(clickMark.at, postStartMark.at),
    clickToPostResponse: diff(clickMark.at, postResponseMark.at),
    postResponseToRefreshStart: diff(postResponseMark.at, refreshStartMark.at),
    refreshToResponse: diff(refreshStartMark.at, refreshResponseMark.at),
    responseToCompletedVisible: diff(refreshResponseMark.at, completedVisibleMark.at),
    clickToCompletedVisible: diff(clickMark.at, completedVisibleMark.at)
  });
  await page.close();
}

const aggregatePhases = (rows) => Object.fromEntries(Object.keys(rows[0]).map((key) => [key, aggregate(rows, key)]));
console.log(JSON.stringify({
  baseUrl,
  controlledDelaysMs: { calendar: 60, completePost: 45 },
  coldDirectCalendar: { samples: initialSamples.length, phases: aggregatePhases(initialSamples) },
  dateTap: { samples: dateTapSamples.length, phases: aggregatePhases(dateTapSamples) },
  monthChange: { samples: monthChangeSamples.length, phases: aggregatePhases(monthChangeSamples) },
  action: { samples: actionSamples.length, phases: aggregatePhases(actionSamples) },
  inAppHomeToCalendar: { samples: inAppHomeToCalendarSamples.length, phases: aggregatePhases(inAppHomeToCalendarSamples) },
  requestCounts,
  note: "Controlled local mock timing; response-to-DOM excludes CSS animation duration. Calendar action uses the existing motion gate and does not use optimistic state."
}, null, 2));

await browser.close();
