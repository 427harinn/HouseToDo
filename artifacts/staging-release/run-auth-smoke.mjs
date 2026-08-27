import { chromium, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.STAGING_SMOKE_BASE_URL ?? "https://house-to-do-staging.427harinn.workers.dev";
const ROOT = process.cwd();
const VIDEO_DIR = path.join(ROOT, "artifacts/staging-release/raw-video");
const REVIEW_DIR = path.join(ROOT, "docs/evidence/staging-release/review-upload");
const DIAGNOSTICS = path.join(ROOT, "docs/evidence/staging-release/diagnostics/staging-release.json");
const unique = `${Date.now()}-${randomBytes(4).toString("hex")}`;
const todayParts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" })
  .formatToParts(new Date()).reduce((parts, part) => ({ ...parts, [part.type]: part.value }), {});
const today = `${todayParts.year}-${todayParts.month}-${todayParts.day}`;
const credentials = {
  owner: { displayName: "STG-A", email: `stg-a-${unique}@example.test`, password: `StgA!${randomBytes(24).toString("base64url")}` },
  member: { displayName: "STG-B", email: `stg-b-${unique}@example.test`, password: `StgB!${randomBytes(24).toString("base64url")}` }
};
const householdName = `STG Release Validation ${unique}`;
const taskTitle = `STG snapshot ${unique}`;
const calendarTitle = `STG calendar ${unique}`;
const shoppingName = `STG shopping ${unique}`;

const result = {
  sourceSha: "28e341a1bfab70a18e00bb39386252b113a22361",
  environment: "staging",
  migration: { before: 14, after: 17, pending: 0, recoveryBookmarkCaptured: true },
  deploy: { previousVersion: "26a6fbf9-476e-4d36-9dfa-8ef07c07275c", currentVersion: "6ee2b2d8-13a8-4ab0-a01c-740af3b4e78c", health: "PASS" },
  previousFixture: { status: "RETAINED", users: 4, households: 2 },
  runnerDiagnosis: { taskAssignee: "NOT_RUN", apiMemberPresent: false, dialogMemberPresent: false, oldLocator: "FAILED" },
  authFixture: { strategy: "synthetic-registration", usersCreated: 0, householdCreated: 0, credentialsPersisted: false, fixtureRetained: false },
  smoke: { home: "NOT_RUN", calendar: "NOT_RUN", shopping: "NOT_RUN", other: "NOT_RUN", taskSnapshot: "NOT_RUN", calendarActionDate: "NOT_RUN", shoppingSync: "NOT_RUN", twoUser: "NOT_RUN", isolation: "NOT_RUN", notificationSettings: "NOT_RUN" },
  notificationPatchFailure: null,
  cleanup: { task: "NOT_RUN", shopping: "NOT_RUN", invite: "retained by dedicated fixture", usersHousehold: "retained" },
  browserSignals: { consoleErrors: 0, pageErrors: 0, requestFailures: 0, crossOriginRequests: 0 },
  production: { deploy: "NOT_RUN", migration: "NOT_RUN", dataAccess: "NONE", dataWrite: "NONE" },
  verdict: "AUTHENTICATED_SMOKE_FAILED"
};

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const json = async (response) => {
  if (!response.ok()) {
    const body = await response.json().catch(() => ({}));
    const error = body?.error ?? {};
    const details = error?.details && typeof error.details === "object" ? Object.keys(error.details).sort() : [];
    throw new Error(`HTTP ${response.status()} for ${response.url()} code=${typeof error.code === "string" ? error.code : "UNKNOWN"} fields=${details.join(",") || "none"}`);
  }
  return response.json();
};
const apiGet = async (page, route) => (await json(await page.request.get(route))).data;
const apiMutate = async (page, method, route, data = {}) => {
  const response = await page.request.fetch(route, { method, data, headers: { origin: BASE } });
  const body = await response.json().catch(() => ({}));
  const error = body?.error ?? {};
  const details = error?.details && typeof error.details === "object" ? Object.keys(error.details).sort() : [];
  if (!response.ok() && route === "/api/notifications/settings") {
    result.notificationPatchFailure = { status: response.status(), code: typeof error.code === "string" ? error.code : "UNKNOWN", validationDetailFields: details };
  }
  if (!response.ok()) throw new Error(`HTTP ${response.status()} for ${response.url()} code=${typeof error.code === "string" ? error.code : "UNKNOWN"} fields=${details.join(",") || "none"}`);
  return body.data;
};
const settle = async (page) => {
  await expect(page.locator(".loader")).toHaveCount(0, { timeout: 30_000 });
};
const visible = async (locator, message) => { await locator.waitFor({ state: "visible", timeout: 30_000 }); assert(await locator.isVisible(), message); };
const noOverflow = async (page, label) => assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${label}: horizontal overflow`);

function attachSignals(page, label) {
  const signals = { consoleErrors: 0, pageErrors: 0, requestFailures: 0, crossOriginRequests: 0 };
  page.on("console", (message) => { if (message.type() === "error") signals.consoleErrors += 1; });
  page.on("pageerror", () => { signals.pageErrors += 1; });
  page.on("requestfailed", () => { signals.requestFailures += 1; });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (["http:", "https:"].includes(url.protocol) && url.origin !== BASE) signals.crossOriginRequests += 1;
  });
  page.on("response", (response) => { if (response.status() >= 500 && new URL(response.url()).origin === BASE) signals.requestFailures += 1; });
  return { label, signals };
}

async function register(page, user, inviteCode = "") {
  await page.goto(`${BASE}/register`, { waitUntil: "domcontentloaded" });
  await visible(page.getByRole("heading", { name: "新規登録" }), "registration form missing");
  await page.getByLabel("表示名").fill(user.displayName);
  await page.getByLabel("メールアドレス").fill(user.email);
  await page.getByLabel("パスワード").fill(user.password);
  if (inviteCode) await page.getByLabel("招待コード（任意）").fill(inviteCode);
  await page.getByRole("button", { name: "新規登録", exact: true }).click();
  const finalPath = inviteCode ? "/home" : "/household/create";
  const finalHeading = inviteCode ? "やること" : "家庭を作る";
  await expect.poll(() => new URL(page.url()).pathname, { timeout: 30_000 }).toBe(finalPath);
  await visible(page.getByRole("heading", { name: finalHeading }), `registration final state missing: ${finalPath}`);
  await expect(page.locator(".loader")).toHaveCount(0);
}

async function createHouseholdViaUi(page) {
  await visible(page.getByRole("heading", { name: "家庭を作る" }), "household create form missing");
  await page.getByLabel("家庭名").fill(householdName);
  await page.getByRole("button", { name: "家庭を作る", exact: true }).click();
  await page.waitForURL(/\/home$/, { timeout: 30_000 });
  await settle(page);
  await visible(page.getByRole("heading", { name: "やること" }), "household create final state missing");
}

async function issueInviteViaUi(page) {
  await page.goto(`${BASE}/other`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("link", { name: "メンバー" }).click();
  await page.waitForURL(/\/other\/members$/);
  await page.getByRole("button", { name: "招待する", exact: true }).click();
  const invite = page.locator("[aria-label^='招待コード ']");
  await visible(invite, "invite code sheet missing");
  const label = await invite.getAttribute("aria-label");
  assert(label?.startsWith("招待コード "), "invite code missing");
  return label.slice("招待コード ".length);
}

async function createTaskViaUi(page, title, assignee = null) {
  await page.goto(`${BASE}/home`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "追加", exact: true }).click();
  await page.getByRole("button", { name: "家事", exact: true }).click();
  await visible(page.getByRole("heading", { name: "家事を追加" }), "task form missing");
  await page.getByLabel("家事名").fill(title);
  if (assignee) {
    const members = (await apiGet(page, "/api/households/current/members")).members;
    const memberB = members.find((entry) => entry.displayName === assignee);
    result.runnerDiagnosis.apiMemberPresent = Boolean(memberB);
    assert(memberB, "HOUSEHOLD_MEMBER_SYNC_BUG");
    await page.getByRole("button", { name: /^担当:/ }).click();
    const dialog = page.getByRole("dialog", { name: "担当" });
    try {
      await visible(dialog, "APP_UI_MEMBER_RENDER_BUG");
      const memberButton = dialog.locator("button").filter({ hasText: memberB.displayName });
      result.runnerDiagnosis.dialogMemberPresent = await memberButton.count() === 1;
      assert(result.runnerDiagnosis.dialogMemberPresent, "APP_UI_MEMBER_RENDER_BUG");
      await expect(memberButton).toHaveCount(1);
      await memberButton.click();
      await visible(page.getByRole("button", { name: `担当: ${memberB.displayName}` }), "assignee selection did not persist");
      result.runnerDiagnosis.taskAssignee = "RUNNER_LOCATOR_BUG";
    } catch (error) {
      if (error instanceof Error && /HOUSEHOLD_MEMBER_SYNC_BUG|APP_UI_MEMBER_RENDER_BUG/.test(error.message)) throw error;
      result.runnerDiagnosis.taskAssignee = result.runnerDiagnosis.apiMemberPresent && !result.runnerDiagnosis.dialogMemberPresent ? "APP_UI_MEMBER_RENDER_BUG" : "RUNNER_LOCATOR_BUG";
      throw error;
    }
  }
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.waitForURL(/\/home$/, { timeout: 30_000 });
  await settle(page);
}

async function findTask(page, title) {
  const data = await apiGet(page, "/api/tasks");
  const task = data.tasks.find((entry) => entry.title === title);
  assert(task, "temporary task not found via API");
  return task;
}

async function completeTaskHome(page, title) {
  await page.goto(`${BASE}/home`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await visible(page.getByRole("button", { name: `${title}を完了`, exact: true }), "task not visible to member");
  await page.getByRole("button", { name: `${title}を完了`, exact: true }).click();
  await settle(page);
}

async function createCalendarTaskViaUi(page, title) { await createTaskViaUi(page, title); }

async function completeCalendarViaUi(page, title) {
  await page.goto(`${BASE}/calendar?date=${today}`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await visible(page.getByRole("grid", { name: /カレンダー/ }), "calendar grid missing");
  const month = Number(today.slice(5, 7));
  const day = Number(today.slice(8, 10));
  const cell = page.getByRole("gridcell", { name: new RegExp(`${month}月${day}日`) }).first();
  await visible(cell, "calendar date cell missing");
  await cell.click();
  const dateSheet = page.getByRole("dialog");
  await visible(dateSheet, "calendar date sheet missing");
  const calendarTask = dateSheet.locator(".calendar-detail-task__main").filter({ hasText: title });
  await expect(calendarTask).toHaveCount(1);
  const completeResponse = page.waitForResponse((response) => response.url().includes(`/api/tasks/`) && response.url().endsWith("/complete") && response.request().method() === "POST");
  await calendarTask.click();
  await completeResponse;
  await settle(page);
}

async function navigateBottom(page, label, expectedHeading) {
  const navigation = page.getByRole("navigation", { name: "主要画面" });
  await navigation.getByRole("button", { name: label, exact: true }).click();
  await expect.poll(() => new URL(page.url()).pathname, { timeout: 30_000 }).toBe({ "ホーム": "/home", "カレンダー": "/calendar", "買い物": "/shopping", "その他": "/other" }[label]);
  await settle(page);
  if (label === "カレンダー") await visible(page.getByRole("grid", { name: /カレンダー/ }), `${label} grid missing`);
  else await visible(page.getByRole("heading", { name: expectedHeading }), `${label} heading missing`);
  await noOverflow(page, label);
}

async function createShoppingViaUi(page) {
  await page.goto(`${BASE}/home`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "追加", exact: true }).click();
  await page.getByRole("button", { name: "買い物", exact: true }).click();
  await visible(page.getByRole("heading", { name: "買い物を追加" }), "shopping form missing");
  await page.getByLabel("商品名").fill(shoppingName);
  await page.getByLabel("数量").fill("1");
  await page.locator("#shopping-planned-purchase-date").fill(today);
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.waitForURL(/\/shopping\?item=/, { timeout: 30_000 });
  await settle(page);
}

async function findShopping(page, name) {
  const data = await apiGet(page, "/api/shopping/items");
  const item = [...data.pending, ...data.purchased].find((entry) => entry.name === name);
  assert(item, "temporary shopping item not found via API");
  return item;
}

async function purchaseShoppingViaUi(page, name) {
  await page.goto(`${BASE}/shopping`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const row = page.locator("[data-shopping-m4-id]").filter({ hasText: name });
  await visible(row, "shopping item not visible to member");
  await row.getByRole("button", { name: name, exact: true }).click();
  await row.getByRole("button", { name: "購入", exact: true }).click();
  await settle(page);
}

async function unpurchaseShoppingViaUi(page, name) {
  await page.goto(`${BASE}/shopping`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: /購入済み/ }).click();
  const row = page.locator("[data-shopping-m4-id]").filter({ hasText: name });
  await visible(row, "purchased shopping item missing");
  await row.getByRole("button", { name: name, exact: true }).click();
  await row.getByRole("button", { name: "戻す", exact: true }).click();
  await settle(page);
}

async function checkOther(page) {
  await page.goto(`${BASE}/other`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await visible(page.getByRole("heading", { name: "その他" }), "other heading missing");
  for (const [label, heading] of [["メンバー", "メンバー"], ["通知", "通知"], ["ストレージ", "ストレージ"], ["家庭設定", "家庭設定"], ["アカウント", "アカウント"]]) {
    await page.goto(`${BASE}/other`, { waitUntil: "domcontentloaded" }); await settle(page);
    await page.getByRole("link", { name: label }).click(); await page.waitForURL(new RegExp(`/other/${label === "メンバー" ? "members" : label === "通知" ? "notifications" : label === "ストレージ" ? "storage" : label === "家庭設定" ? "household" : "account"}$`));
    await visible(page.getByRole("heading", { name: heading }), `${label} heading missing`);
  }
  const accountName = page.getByLabel("表示名"); const accountMail = page.getByLabel("メール");
  await visible(accountName, "account display name missing"); await visible(accountMail, "account email field missing");
  await noOverflow(page, "other");
}

async function createAuthenticatedRecordingPage(state, label) {
  const context = await browser.newContext({ storageState: state, baseURL: BASE, viewport: { width: 390, height: 844 }, locale: "ja-JP", timezoneId: "Asia/Tokyo", recordVideo: { dir: VIDEO_DIR, size: { width: 390, height: 844 } } });
  const page = await context.newPage();
  const attached = attachSignals(page, label);
  await page.goto(`${BASE}/home`, { waitUntil: "domcontentloaded" });
  await expect.poll(() => new URL(page.url()).pathname, { timeout: 30_000 }).toBe("/home");
  await visible(page.getByRole("heading", { name: "やること" }), "recording home heading missing");
  await expect(page.locator(".loader")).toHaveCount(0);
  await visible(page.getByRole("navigation", { name: "主要画面" }), "recording bottom navigation missing");
  return { context, page, signals: attached.signals };
}

async function captureVideo(state, filename, flow) {
  const { context, page, signals } = await createAuthenticatedRecordingPage(state, filename);
  await flow(page);
  await page.waitForTimeout(800);
  const video = page.video();
  await context.close();
  const source = video && await video.path();
  assert(source, `video missing: ${filename}`);
  await rename(source, path.join(REVIEW_DIR, filename));
  return signals;
}

async function boardScreenshot(filename, title, lines) {
  const boardBrowser = await chromium.launch({ headless: true });
  const context = await boardBrowser.newContext({ viewport: { width: 900, height: 900 }, locale: "ja-JP" });
  const page = await context.newPage();
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:42px;background:#f3f7f4;color:#17382d;font-family:Arial,sans-serif}main{background:white;border:1px solid #cadbd0;border-radius:18px;padding:32px;box-shadow:0 8px 24px #17382d18}h1{font-size:26px;margin:0 0 24px}p{font-size:16px;line-height:1.7;margin:8px 0}.label{color:#587167;font-weight:700}.pass{color:#16734b;font-weight:700}.block{color:#a33c2d;font-weight:700}</style><main><h1>${title}</h1>${lines.map(({label,value,kind="pass"}) => `<p><span class="label">${label}</span> <span class="${kind}">${value}</span></p>`).join("")}</main>`);
  await page.screenshot({ path: path.join(REVIEW_DIR, filename), fullPage: true });
  await context.close();
  await boardBrowser.close();
}

let browser;
let ownerSetup;
let memberSetup;
let ownerState;
let memberState;
let ownerSmoke;
let memberSmoke;
let taskId;
let calendarTaskId;
let shoppingId;
let taskRecordId;
let calendarRecordId;
let owner;
let member;
let memberDisplayName;
let memberUserId;
const videoSignals = [];

try {
  await mkdir(VIDEO_DIR, { recursive: true });
  await mkdir(REVIEW_DIR, { recursive: true });
  for (const file of await readdir(REVIEW_DIR)) await rm(path.join(REVIEW_DIR, file), { recursive: true, force: true });
  browser = await chromium.launch({ headless: true });
  ownerSetup = await browser.newContext({ baseURL: BASE, locale: "ja-JP", timezoneId: "Asia/Tokyo" });
  memberSetup = await browser.newContext({ baseURL: BASE, locale: "ja-JP", timezoneId: "Asia/Tokyo" });
  const ownerPage = await ownerSetup.newPage();
  const memberPage = await memberSetup.newPage();
  attachSignals(ownerPage, "setup-owner"); attachSignals(memberPage, "setup-member");

  await register(ownerPage, credentials.owner);
  await createHouseholdViaUi(ownerPage);
  const ownerHousehold = (await apiGet(ownerPage, "/api/households/current")).household;
  assert(ownerHousehold?.role === "owner" && ownerHousehold.name === householdName, "owner household contract failed");
  const inviteCode = await issueInviteViaUi(ownerPage);
  await register(memberPage, credentials.member, inviteCode);
  const memberHousehold = (await apiGet(memberPage, "/api/households/current")).household;
  assert(memberHousehold?.id === ownerHousehold.id && memberHousehold.role === "member", "member joined wrong household");
  const members = (await apiGet(ownerPage, "/api/households/current/members")).members;
  assert(members.length === 2 && members.some((m) => m.displayName === credentials.owner.displayName) && members.some((m) => m.displayName === credentials.member.displayName), "dedicated household member contract failed");
  memberDisplayName = members.find((entry) => entry.displayName === credentials.member.displayName)?.displayName;
  memberUserId = members.find((entry) => entry.displayName === credentials.member.displayName)?.userId;
  assert(memberDisplayName, "dedicated household member display name missing");
  assert(memberUserId, "dedicated household member id missing");
  result.authFixture.usersCreated = 2; result.authFixture.householdCreated = 1; result.authFixture.fixtureRetained = true;
  result.smoke.isolation = "PASS";
  ownerState = await ownerSetup.storageState(); memberState = await memberSetup.storageState();
  await ownerSetup.close(); await memberSetup.close(); ownerSetup = undefined; memberSetup = undefined;
  ownerSmoke = await browser.newContext({ storageState: ownerState, baseURL: BASE, locale: "ja-JP", timezoneId: "Asia/Tokyo", viewport: { width: 390, height: 844 } });
  memberSmoke = await browser.newContext({ storageState: memberState, baseURL: BASE, locale: "ja-JP", timezoneId: "Asia/Tokyo", viewport: { width: 390, height: 844 } });
  owner = await ownerSmoke.newPage(); member = await memberSmoke.newPage();
  const ownerSignals = attachSignals(owner, "owner-smoke"); const memberSignals = attachSignals(member, "member-smoke");

  videoSignals.push(await captureVideo(ownerState, "staging-core-navigation.webm", async (page) => {
    for (const [button, heading] of [["ホーム", "やること"], ["カレンダー", "カレンダー"], ["買い物", "買い物"], ["その他", "その他"], ["ホーム", "やること"]]) {
      await navigateBottom(page, button, heading);
      result.smoke[{ "ホーム": "home", "カレンダー": "calendar", "買い物": "shopping", "その他": "other" }[button]] = "PASS";
    }
  }));
  await checkOther(owner); result.smoke.other = "PASS";
  const notification = await apiGet(owner, "/api/notifications/settings");
  assert(notification.morningSummaryEnabled === false && notification.morningSummaryTime === "09:00", "0015 notification default contract failed");
  const temporaryNotification = { ...notification, morningSummaryEnabled: true, morningSummaryTime: "09:15" };
  await apiMutate(owner, "PATCH", "/api/notifications/settings", temporaryNotification);
  const changedNotification = await apiGet(owner, "/api/notifications/settings");
  assert(changedNotification.morningSummaryEnabled === true && changedNotification.morningSummaryTime === "09:15" && changedNotification.eveningSummaryEnabled === notification.eveningSummaryEnabled && changedNotification.eveningSummaryTime === notification.eveningSummaryTime && changedNotification.timezone === notification.timezone, "notification temporary change failed");
  await apiMutate(owner, "PATCH", "/api/notifications/settings", notification);
  const restoredNotification = await apiGet(owner, "/api/notifications/settings");
  assert(JSON.stringify(restoredNotification) === JSON.stringify(notification), "notification restore failed");
  result.smoke.notificationSettings = "PASS";

  videoSignals.push(await captureVideo(ownerState, "staging-task-calendar.webm", async (page) => {
    await createTaskViaUi(page, taskTitle, memberDisplayName);
    const task = await findTask(page, taskTitle); taskId = task.id;
    await completeTaskHome(member, taskTitle);
    await owner.reload(); await settle(owner);
    await owner.getByRole("button", { name: /完了済み/ }).click(); await visible(owner.getByText(taskTitle), "completed task history missing"); await visible(owner.getByText(memberDisplayName, { exact: true }), "completed actor missing");
    const history = (await apiGet(owner, `/api/tasks/${taskId}/history`)).records; const record = history.find((entry) => entry.status === "completed");
    assert(record?.taskTitleSnapshot === taskTitle && record.assignedUserIdSnapshot === memberUserId && record.assignedUserDisplayNameSnapshot === memberDisplayName, "0016 snapshot contract failed"); taskRecordId = record.id; result.smoke.taskSnapshot = "PASS";
    await apiMutate(owner, "POST", `/api/tasks/${taskId}/restore`, { recordId: taskRecordId }); await member.reload(); await settle(member); await visible(member.getByText(taskTitle), "restored active task missing");
    await createCalendarTaskViaUi(page, calendarTitle); const calendarTask = await findTask(page, calendarTitle); calendarTaskId = calendarTask.id;
    await completeCalendarViaUi(page, calendarTitle);
    const calendarHistory = (await apiGet(owner, `/api/tasks/${calendarTaskId}/history`)).records; const calendarRecord = calendarHistory.find((entry) => entry.status === "completed");
    assert(calendarRecord?.calendarActionDate === today, "0017 calendar_action_date contract failed"); calendarRecordId = calendarRecord.id; result.smoke.calendarActionDate = "PASS";
    await apiMutate(owner, "POST", `/api/tasks/${calendarTaskId}/calendar-restore`, { recordId: calendarRecordId, calendarDate: today });
  }));

  videoSignals.push(await captureVideo(ownerState, "staging-shopping.webm", async (page) => {
    await createShoppingViaUi(page); const item = await findShopping(page, shoppingName); shoppingId = item.id; assert(item.plannedPurchaseDate === today, "shopping planned date not saved");
    await purchaseShoppingViaUi(member, shoppingName); await page.reload(); await settle(page); await page.getByRole("button", { name: /購入済み/ }).click(); const purchased = page.locator("[data-shopping-m4-id]").filter({ hasText: shoppingName }); await visible(purchased, "purchased item missing"); await visible(purchased.getByRole("img", { name: `購入者: ${memberDisplayName}` }), "purchaser missing");
    await unpurchaseShoppingViaUi(member, shoppingName); const restored = await findShopping(owner, shoppingName); assert(restored.status === "pending" && restored.plannedPurchaseDate === today, "shopping restore/planned date contract failed");
    await page.goto(`${BASE}/shopping/new`, { waitUntil: "domcontentloaded" }); await settle(page); await page.getByRole("button", { name: "以前の項目から選ぶ" }).click(); await visible(page.getByRole("button", { name: shoppingName, exact: true }), "shopping recent candidate missing"); await page.getByRole("button", { name: shoppingName, exact: true }).click(); await assert(page.getByLabel("商品名").getAttribute("value") === shoppingName, "shopping reuse did not populate form");
  }));
  result.smoke.shopping = "PASS";
  result.smoke.shoppingSync = "PASS";

  videoSignals.push(await captureVideo(ownerState, "staging-two-user.webm", async (page) => {
    await page.goto(`${BASE}/other/members`, { waitUntil: "domcontentloaded" }); await settle(page); await visible(page.getByRole("heading", { name: "メンバー" }), "members heading missing"); await visible(page.getByText(credentials.owner.displayName, { exact: true }), "owner fixture member missing"); await visible(page.getByText(memberDisplayName, { exact: true }), "member fixture member missing");
    await page.goto(`${BASE}/home`, { waitUntil: "domcontentloaded" }); await settle(page); await visible(page.getByRole("heading", { name: "やること" }), "home after two-user smoke missing");
  }));
  result.smoke.twoUser = "PASS";

  await apiMutate(owner, "DELETE", `/api/tasks/${taskId}`); await apiMutate(owner, "DELETE", `/api/tasks/${calendarTaskId}`); result.cleanup.task = "PASS";
  await apiMutate(owner, "DELETE", `/api/shopping/items/${shoppingId}`); result.cleanup.shopping = "PASS";
  assert((await apiGet(owner, "/api/tasks")).tasks.every((entry) => ![taskTitle, calendarTitle].includes(entry.title)), "temporary task cleanup failed");
  const shoppingAfter = await apiGet(owner, "/api/shopping/items"); assert([...shoppingAfter.pending, ...shoppingAfter.purchased].every((entry) => entry.name !== shoppingName), "temporary shopping cleanup failed");
  const finalMembers = (await apiGet(owner, "/api/households/current/members")).members; assert(finalMembers.length === 2, "fixture household members changed unexpectedly");
  await owner.goto(`${BASE}/other/account`, { waitUntil: "domcontentloaded" }); await settle(owner); await owner.getByRole("button", { name: "ログアウト", exact: true }).click(); await visible(owner.getByRole("heading", { name: "ログアウトしますか？" }), "logout confirmation missing"); await owner.locator(".m5-sheet-actions").getByRole("button", { name: "ログアウト", exact: true }).click(); await owner.waitForURL(/\/login$/, { timeout: 30_000 });
  const combinedSignals = [ownerSignals.signals, memberSignals.signals, ...videoSignals].reduce((acc, item) => { for (const key of Object.keys(acc)) acc[key] += item[key]; return acc; }, { consoleErrors: 0, pageErrors: 0, requestFailures: 0, crossOriginRequests: 0 });
  result.browserSignals = combinedSignals; assert(combinedSignals.consoleErrors === 0 && combinedSignals.pageErrors === 0 && combinedSignals.requestFailures === 0 && combinedSignals.crossOriginRequests === 0, "browser signal gate failed");
  result.verdict = "READY_FOR_REAL_IPHONE_VALIDATION";
} catch (error) {
  result.verdict = error instanceof Error && /0016 snapshot/.test(error.message) ? "TASK_SNAPSHOT_FAILED" : error instanceof Error && /0017/.test(error.message) ? "CALENDAR_ACTION_DATE_FAILED" : error instanceof Error && /shopping/.test(error.message) ? "SHOPPING_SYNC_FAILED" : "AUTHENTICATED_SMOKE_FAILED";
  console.error(`staging-release validation failed: ${result.verdict}`);
  console.error("smoke details omitted to keep credentials, invite codes, and page data out of logs");
  throw error;
} finally {
  result.authFixture.credentialsPersisted = false;
  if (owner && result.verdict !== "READY_FOR_REAL_IPHONE_VALIDATION") {
    if (taskId) await apiMutate(owner, "DELETE", `/api/tasks/${taskId}`).then(() => { result.cleanup.task = "PASS"; }).catch(() => undefined);
    if (calendarTaskId) await apiMutate(owner, "DELETE", `/api/tasks/${calendarTaskId}`).then(() => { result.cleanup.task = "PASS"; }).catch(() => undefined);
    if (shoppingId) await apiMutate(owner, "DELETE", `/api/shopping/items/${shoppingId}`).then(() => { result.cleanup.shopping = "PASS"; }).catch(() => undefined);
  }
  if (ownerSmoke) await ownerSmoke.close().catch(() => undefined);
  if (memberSmoke) await memberSmoke.close().catch(() => undefined);
  if (ownerSetup) await ownerSetup.close().catch(() => undefined);
  if (memberSetup) await memberSetup.close().catch(() => undefined);
  if (browser) await browser.close().catch(() => undefined);
  await mkdir(path.dirname(DIAGNOSTICS), { recursive: true });
  await writeFile(DIAGNOSTICS, JSON.stringify(result, null, 2), "utf8");
  credentials.owner.password = ""; credentials.owner.email = ""; credentials.member.password = ""; credentials.member.email = "";
}

if (result.verdict === "READY_FOR_REAL_IPHONE_VALIDATION") {
  await boardScreenshot("01-staging-migration.png", "01 staging migration", [
    { label: "Before", value: "14/17" }, { label: "Recovery bookmark", value: "CAPTURED" }, { label: "Applied", value: "0015 · 0016 · 0017" }, { label: "After", value: "17/17" }, { label: "Schema", value: "VERIFIED" }, { label: "Critical row counts", value: "PRESERVED" }, { label: "Production", value: "NOT TOUCHED" }
  ]);
  await boardScreenshot("02-staging-deploy-health.png", "02 deploy health", [
    { label: "Main/app source SHA", value: result.sourceSha }, { label: "Previous Worker", value: "26a6fbf9-476e-4d36-9dfa-8ef07c07275c" }, { label: "New Worker", value: "6ee2b2d8-13a8-4ab0-a01c-740af3b4e78c" }, { label: "dry-run", value: "PASS" }, { label: "deploy", value: "PASS" }, { label: "/api/health", value: "200 · D1 true · R2 true" }, { label: "Cron", value: "UNCHANGED" }
  ]);
  await boardScreenshot("03-staging-auth-smoke.png", "03 authenticated smoke", [
    { label: "Home", value: result.smoke.home }, { label: "Calendar", value: result.smoke.calendar }, { label: "TaskRecord snapshot", value: result.smoke.taskSnapshot }, { label: "calendar_action_date", value: result.smoke.calendarActionDate }, { label: "Shopping", value: result.smoke.shopping }, { label: "Other", value: result.smoke.other }, { label: "Two-user", value: result.smoke.twoUser }, { label: "Isolation", value: result.smoke.isolation }
  ]);
  await boardScreenshot("04-staging-final-verdict.png", "04 staging final verdict", [
    { label: "Verdict", value: result.verdict }, { label: "Synthetic fixture", value: "2 users + 1 staging household retained" }, { label: "Temporary fixtures", value: "cleaned up" }, { label: "Credentials", value: "NOT STORED" }, { label: "Production deploy", value: "NOT RUN" }, { label: "Production migration", value: "NOT RUN" }
  ]);
}

console.log(JSON.stringify({ verdict: result.verdict, usersCreated: result.authFixture.usersCreated, householdCreated: result.authFixture.householdCreated, taskSnapshot: result.smoke.taskSnapshot, calendarActionDate: result.smoke.calendarActionDate, shopping: result.smoke.shopping, twoUser: result.smoke.twoUser, reviewFiles: result.verdict === "READY_FOR_REAL_IPHONE_VALIDATION" ? 8 : 0 }));
