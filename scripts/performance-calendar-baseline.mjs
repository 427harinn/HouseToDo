/* global Buffer, fetch, performance */

const baseUrl = process.env.PERF_BASE_URL ?? "http://127.0.0.1:8787";
const origin = "http://localhost:5174";
const targetUrl = new URL(baseUrl);
if (!targetUrl.port || !["127.0.0.1", "localhost"].includes(targetUrl.hostname)) {
  throw new Error("This diagnostic writes only to a loopback local Worker.");
}

const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))];
};

const summary = (values) => ({
  count: values.length,
  min: Number(Math.min(...values).toFixed(2)),
  p50: Number(percentile(values, 0.5).toFixed(2)),
  p95: Number(percentile(values, 0.95).toFixed(2)),
  max: Number(Math.max(...values).toFixed(2))
});

const request = async (path, { method = "GET", cookie = "", body } = {}) => {
  const start = performance.now();
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(method !== "GET" ? { origin, "content-type": "application/json" } : {})
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const raw = await response.text();
  const durationMs = performance.now() - start;
  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(`${method} ${path} returned non-JSON ${response.status}`);
  }
  if (!response.ok || json.ok === false) {
    throw new Error(`${method} ${path} failed with ${response.status}: ${json.error?.code ?? "unknown"}`);
  }
  return {
    durationMs,
    rawBytes: Buffer.byteLength(raw),
    setCookie: response.headers.get("set-cookie"),
    data: json.data
  };
};

const measured = async (path, options, count = 15, warmup = 3) => {
  for (let index = 0; index < warmup; index += 1) await request(path, options);
  const samples = [];
  let last;
  for (let index = 0; index < count; index += 1) {
    last = await request(path, options);
    samples.push(last.durationMs);
  }
  return { timing: summary(samples), last };
};

const byteLength = (value) => Buffer.byteLength(JSON.stringify(value));
const calendarSections = (data) => ({
  dates: byteLength(data.dates),
  selectedFixed: byteLength(data.selected.fixed),
  selectedWeeklyFlexible: byteLength(data.selected.weeklyFlexible),
  selectedMonthlyFlexible: byteLength(data.selected.monthlyFlexible),
  selectedCompleted: byteLength(data.selected.completed),
  selectedShopping: byteLength(data.selected.shopping),
  selectedDetail: byteLength(data.selected)
});

const registerEmail = `calendar-perf-${Date.now()}@example.invalid`;
const registered = await request("/api/auth/register", {
  method: "POST",
  body: { email: registerEmail, password: "long-performance-password", displayName: "Calendar Performance" }
});
const cookieHeader = registered.setCookie?.split(";", 1)[0];
if (!cookieHeader) throw new Error("registration did not return a session cookie");
const userId = registered.data.user.id;

await request("/api/households", {
  method: "POST",
  cookie: cookieHeader,
  body: { name: "Calendar Performance House" }
});

const representativeDate = "2026-08-28";
const createTask = async (body) => (await request("/api/tasks", {
  method: "POST",
  cookie: cookieHeader,
  body
})).data.task;

const seededTasks = [
  await createTask({ title: "Calendar daily", modelRecurrenceType: "daily", assignmentType: "anyone", notificationSlot: "none", startDate: representativeDate }),
  await createTask({ title: "Calendar weekly fixed", modelRecurrenceType: "weekly_fixed", weekdays: [1, 3], assignmentType: "anyone", notificationSlot: "none", startDate: representativeDate }),
  await createTask({ title: "Calendar monthly fixed", modelRecurrenceType: "monthly_fixed", monthlyDayOfMonth: 15, assignmentType: "anyone", notificationSlot: "none", startDate: representativeDate }),
  await createTask({ title: "Calendar weekly flexible", modelRecurrenceType: "weekly_flexible", weeklyDeadlineWeekday: 5, assignmentType: "anyone", notificationSlot: "none", startDate: representativeDate }),
  await createTask({ title: "Calendar monthly flexible", modelRecurrenceType: "monthly_flexible", monthlyDeadlineType: "month_end", assignmentType: "anyone", notificationSlot: "none", startDate: representativeDate }),
  await createTask({ title: "Calendar once", modelRecurrenceType: "once", targetDate: representativeDate, assignmentType: "anyone", notificationSlot: "none" }),
  await createTask({ title: "Calendar assigned", modelRecurrenceType: "daily", assignmentType: "specific", assignedUserId: userId, notificationSlot: "none", startDate: representativeDate })
];

await request(`/api/tasks/${seededTasks[0].id}/complete`, {
  method: "POST",
  cookie: cookieHeader,
  body: { targetDate: representativeDate, calendarDate: representativeDate }
});
await request(`/api/tasks/${seededTasks[6].id}/skip`, {
  method: "POST",
  cookie: cookieHeader,
  body: { targetDate: representativeDate, calendarDate: representativeDate }
});

const plannedShoppingDates = ["2026-08-28", "2026-08-29", "2026-09-12"];
for (const [index, plannedPurchaseDate] of plannedShoppingDates.entries()) {
  await request("/api/shopping/items", {
    method: "POST",
    cookie: cookieHeader,
    body: { name: `Calendar shopping ${index + 1}`, quantity: "1", plannedPurchaseDate }
  });
}

const endpoint = (from, to, selectedDate) => `/api/tasks/calendar?from=${from}&to=${to}&selectedDate=${selectedDate}`;
const cases = {
  currentMonth: { from: "2026-07-26", to: "2026-09-05", selectedDate: "2026-08-28" },
  sameMonthDifferentDate: { from: "2026-07-26", to: "2026-09-05", selectedDate: "2026-08-29" },
  nextMonth: { from: "2026-08-30", to: "2026-10-10", selectedDate: "2026-09-15" },
  previousMonth: { from: "2026-06-28", to: "2026-08-08", selectedDate: "2026-07-15" }
};

const results = {};
for (const [name, range] of Object.entries(cases)) {
  const measuredCase = await measured(endpoint(range.from, range.to, range.selectedDate), { cookie: cookieHeader });
  results[name] = {
    range,
    timing: measuredCase.timing,
    responseBytes: measuredCase.last.rawBytes,
    sections: calendarSections(measuredCase.last.data)
  };
}

const currentResponse = await request(endpoint(cases.currentMonth.from, cases.currentMonth.to, cases.currentMonth.selectedDate), { cookie: cookieHeader });
const sameMonthResponse = await request(endpoint(cases.sameMonthDifferentDate.from, cases.sameMonthDifferentDate.to, cases.sameMonthDifferentDate.selectedDate), { cookie: cookieHeader });
const currentDatesJson = JSON.stringify(currentResponse.data.dates);
const sameMonthDatesJson = JSON.stringify(sameMonthResponse.data.dates);

console.log(JSON.stringify({
  baseUrl,
  warmupCount: 3,
  sampleCount: 15,
  seeded: {
    daily: 2,
    weeklyFixed: 1,
    monthlyFixed: 1,
    weeklyFlexible: 1,
    monthlyFlexible: 1,
    once: 1,
    assignedTaskIncluded: true,
    totalTasks: seededTasks.length,
    completedRecords: 1,
    skippedRecords: 1,
    plannedShoppingDates,
    representativeDate
  },
  cases: results,
  sameMonthComparison: {
    datesEqual: currentDatesJson === sameMonthDatesJson,
    duplicatedUnchangedDatesBytes: currentDatesJson === sameMonthDatesJson ? byteLength(currentResponse.data.dates) : 0,
    currentResponseBytes: currentResponse.rawBytes,
    sameMonthResponseBytes: sameMonthResponse.rawBytes,
    currentSelectedDetailBytes: byteLength(currentResponse.data.selected),
    sameMonthSelectedDetailBytes: byteLength(sameMonthResponse.data.selected)
  }
}, null, 2));
