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
  min: Math.min(...values),
  p50: percentile(values, 0.5),
  p95: percentile(values, 0.95),
  max: Math.max(...values)
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
    status: response.status,
    rawBytes: Buffer.byteLength(raw),
    setCookie: response.headers.get("set-cookie"),
    data: json.data
  };
};

const measured = async (path, options, count = 15, warmup = 3) => {
  for (let index = 0; index < warmup; index += 1) await request(path, options);
  const samples = [];
  for (let index = 0; index < count; index += 1) {
    samples.push((await request(path, options)).durationMs);
  }
  return summary(samples);
};

const registerEmail = `perf-${Date.now()}@example.invalid`;
const registered = await request("/api/auth/register", {
  method: "POST",
  body: { email: registerEmail, password: "long-performance-password", displayName: "Performance" }
});
const cookieHeader = registered.setCookie?.split(";", 1)[0];
if (!cookieHeader) throw new Error("registration did not return a session cookie");

await request("/api/households", {
  method: "POST",
  cookie: cookieHeader,
  body: { name: "Performance House" }
});

const createTask = async (body) => (await request("/api/tasks", {
  method: "POST",
  cookie: cookieHeader,
  body
})).data.task;

const representativeStartDate = new Date().toISOString().slice(0, 10);
const activeTaskIds = [];
for (let index = 0; index < 12; index += 1) {
  const task = await createTask({
    title: `Performance daily ${index + 1}`,
    recurrenceType: "daily",
    assignmentType: "anyone",
    notificationSlot: "none"
  });
  activeTaskIds.push(task.id);
}
const weeklySeeded = [];
for (let index = 0; index < 3; index += 1) {
  weeklySeeded.push(await createTask({
    title: `Performance weekly ${index + 1}`,
    description: null,
    recurrenceType: "weekly_flexible",
    modelRecurrenceType: "weekly_flexible",
    assignmentType: "anyone",
    assignedUserId: null,
    scheduledTime: null,
    notificationSlot: "none",
    notificationTime: null,
    weekdays: [],
    weeklyTargetCount: null,
    startDate: representativeStartDate,
    targetDate: null,
    deadlineTime: null,
    notificationOffsetMinutes: null,
    weeklyDeadlineWeekday: 5,
    monthlyDayOfMonth: null,
    monthlyDeadlineDay: null,
    monthlyDeadlineType: null
  }));
}
await createTask({
  title: "Performance scheduled",
  recurrenceType: "scheduled",
  assignmentType: "anyone",
  notificationSlot: "none",
  weekdays: [1, 3, 5]
});

for (let index = 0; index < 5; index += 1) {
  await request("/api/shopping/items", {
    method: "POST",
    cookie: cookieHeader,
    body: { name: `Performance shopping ${index + 1}`, quantity: "1" }
  });
}

const endpointOptions = { cookie: cookieHeader };
const api = {
  authMe: await measured("/api/auth/me", endpointOptions),
  household: await measured("/api/households/current", endpointOptions),
  dashboard: await measured("/api/dashboard/today", endpointOptions),
  home: await measured("/api/home/today", endpointOptions)
};

const canonicalWeeklyFlexibleSeeded = weeklySeeded.filter((task) => task.modelRecurrenceType === "weekly_flexible").length;
const legacyWeeklyAmongSeeded = weeklySeeded.filter((task) => task.recurrenceType === "weekly" && task.modelRecurrenceType !== "weekly_flexible").length;
if (canonicalWeeklyFlexibleSeeded !== 3 || legacyWeeklyAmongSeeded !== 0) {
  throw new Error(`representative weekly seed verification failed: canonical=${canonicalWeeklyFlexibleSeeded}, legacy=${legacyWeeklyAmongSeeded}`);
}

const freshDashboard = await request("/api/dashboard/today", endpointOptions);
const freshHome = await request("/api/home/today", endpointOptions);

const completeSamples = [];
const postCompleteHomeSamples = [];
let lastHome;
for (const taskId of activeTaskIds.slice(0, 10)) {
  const complete = await request(`/api/tasks/${taskId}/complete`, {
    method: "POST",
    cookie: cookieHeader,
    body: {}
  });
  completeSamples.push(complete.durationMs);
  const refreshed = await request("/api/home/today", endpointOptions);
  postCompleteHomeSamples.push(refreshed.durationMs);
  lastHome = refreshed;
}
api.completePost = summary(completeSamples);
api.postCompleteHome = summary(postCompleteHomeSamples);

const dashboardData = freshDashboard.data;
const homeData = freshHome.data;
const postHomeData = lastHome?.data ?? (await request("/api/home/today", endpointOptions)).data;
const dashboardSectionBytes = {};
for (const key of ["homeTasks", "todayTasks", "weeklyTasks", "completedRecords", "passedRecords", "shopping", "members"]) {
  dashboardSectionBytes[key] = Buffer.byteLength(JSON.stringify(dashboardData[key]));
}
const homeSectionBytes = {};
for (const key of ["homeTasks", "completedRecords", "passedRecords", "shopping", "members"]) {
  homeSectionBytes[key] = Buffer.byteLength(JSON.stringify(homeData[key]));
}

console.log(JSON.stringify({
  baseUrl,
  warmupCount: 3,
  sampleCount: 15,
  completionSampleCount: 10,
  seeded: { dailyTasks: 12, weeklyTasks: 3, scheduledTasks: 1, pendingShopping: 5, activeTasks: 16, representativeStartDate },
  weeklySeedVerification: { canonicalWeeklyFlexibleSeeded, legacyWeeklyAmongSeeded },
  api,
  freshDashboardResponseBytes: freshDashboard.rawBytes,
  dashboardSectionBytes,
  freshHomeResponseBytes: freshHome.rawBytes,
  homeSectionBytes,
  postCompletionHomeResponseBytes: lastHome?.rawBytes ?? null,
  postCompletionHomeSectionBytes: Object.fromEntries(Object.keys(homeSectionBytes).map((key) => [key, Buffer.byteLength(JSON.stringify(postHomeData[key]))])),
  homeCompletedRows: postHomeData.completedRecords?.length ?? null,
  homeActiveRows: postHomeData.homeTasks?.length ?? null
}, null, 2));
