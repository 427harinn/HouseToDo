import { chromium, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";

const BASE = process.env.LOCAL_SMOKE_BASE_URL ?? "http://127.0.0.1:5174";
const todayParts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" })
  .formatToParts(new Date()).reduce((parts, part) => ({ ...parts, [part.type]: part.value }), {});
const today = `${todayParts.year}-${todayParts.month}-${todayParts.day}`;

const json = async (response) => {
  expect(response.ok()).toBeTruthy();
  return response.json();
};
const apiGet = async (page, route) => (await json(await page.request.get(route))).data;
const apiMutate = async (page, method, route, data = {}) => (await json(await page.request.fetch(route, { method, data, headers: { origin: BASE } }))).data;
const waitForState = async (page, pathname, heading) => {
  await expect.poll(() => new URL(page.url()).pathname, { timeout: 30_000 }).toBe(pathname);
  await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  await expect(page.locator(".loader")).toHaveCount(0);
};

async function createAuthenticatedRecordingPage(browser, storageState) {
  const context = await browser.newContext({ baseURL: BASE, storageState, locale: "ja-JP", timezoneId: "Asia/Tokyo", viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(`${BASE}/home`, { waitUntil: "domcontentloaded" });
  await expect.poll(() => new URL(page.url()).pathname, { timeout: 30_000 }).toBe("/home");
  await expect(page.getByRole("heading", { name: "やること" })).toBeVisible();
  await expect(page.locator(".loader")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "主要画面" })).toBeVisible();
  return { context, page };
}

async function navigateBottom(page, label, pathname, heading) {
  const navigation = page.getByRole("navigation", { name: "主要画面" });
  await navigation.getByRole("button", { name: label, exact: true }).click();
  await expect.poll(() => new URL(page.url()).pathname, { timeout: 30_000 }).toBe(pathname);
  await expect(page.locator(".loader")).toHaveCount(0);
  if (label === "カレンダー") await expect(page.getByRole("grid", { name: /カレンダー/ })).toBeVisible();
  else await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  const overflow = await page.evaluate(() => globalThis.document.documentElement.scrollWidth > globalThis.document.documentElement.clientWidth + 1);
  expect(overflow).toBeFalsy();
}

async function register(page, user, inviteCode = "") {
  await page.goto(`${BASE}/register`, { waitUntil: "domcontentloaded" });
  await page.locator("#register-name").fill(user.displayName);
  await page.locator("#register-email").fill(user.email);
  await page.locator("#register-password").fill(user.password);
  if (inviteCode) await page.locator("#register-invite-code").fill(inviteCode);
  await page.locator('form button[type="submit"]').click();
  await waitForState(page, inviteCode ? "/home" : "/household/create", inviteCode ? "やること" : "家庭を作る");
}

async function createHousehold(page, name) {
  await page.locator("#household-name").fill(name);
  await page.locator('form button[type="submit"]').click();
  await waitForState(page, "/home", "やること");
}

async function issueInvite(page) {
  await page.goto(`${BASE}/other/members`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "メンバー" })).toBeVisible();
  await page.getByRole("button", { name: "招待する", exact: true }).click();
  const invite = page.locator("[aria-label^='招待コード ']");
  await expect(invite).toBeVisible();
  const label = await invite.getAttribute("aria-label");
  expect(label?.startsWith("招待コード ")).toBeTruthy();
  return label.slice("招待コード ".length);
}

async function createAssignedTask(page, title, memberDisplayName) {
  await page.goto(`${BASE}/home`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "やること" })).toBeVisible();
  await page.getByRole("button", { name: "追加", exact: true }).click();
  await page.getByRole("button", { name: "家事", exact: true }).click();
  await expect(page.getByRole("heading", { name: "家事を追加" })).toBeVisible();
  await page.locator("#m2-task-title").fill(title);

  const members = (await apiGet(page, "/api/households/current/members")).members;
  const memberB = members.find((entry) => entry.displayName === memberDisplayName);
  expect(memberB).toBeTruthy();
  await page.getByRole("button", { name: /^担当:/ }).click();
  const dialog = page.getByRole("dialog", { name: "担当" });
  await expect(dialog).toBeVisible();
  const memberButton = dialog.locator("button").filter({ hasText: memberB.displayName });
  await expect(memberButton).toHaveCount(1);
  await memberButton.click();
  await expect(page.getByRole("button", { name: `担当: ${memberB.displayName}` })).toBeVisible();
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await waitForState(page, "/home", "やること");
  return (await apiGet(page, "/api/tasks")).tasks.find((entry) => entry.title === title);
}

async function verifyNotificationSettings(page) {
  const original = await apiGet(page, "/api/notifications/settings");
  expect(original).toMatchObject({
    eveningSummaryEnabled: false,
    eveningSummaryTime: "21:00",
    morningSummaryEnabled: false,
    morningSummaryTime: "09:00",
    timezone: expect.any(String)
  });
  const temporary = { ...original, morningSummaryEnabled: true, morningSummaryTime: "09:15" };
  const saved = await apiMutate(page, "PATCH", "/api/notifications/settings", temporary);
  expect(saved).toEqual(temporary);
  expect(await apiGet(page, "/api/notifications/settings")).toEqual(temporary);
  const restored = await apiMutate(page, "PATCH", "/api/notifications/settings", original);
  expect(restored).toEqual(original);
  expect(await apiGet(page, "/api/notifications/settings")).toEqual(original);
}

async function runOne(browser, index) {
  const suffix = `${Date.now()}-${index}-${randomBytes(4).toString("hex")}`;
  const owner = { displayName: `LOCAL-A-${index}`, email: `local-a-${suffix}@example.test`, password: `LocalA!${randomBytes(24).toString("base64url")}` };
  const member = { displayName: `LOCAL-B-${index}`, email: `local-b-${suffix}@example.test`, password: `LocalB!${randomBytes(24).toString("base64url")}` };
  const householdName = `LOCAL Runner ${suffix}`;
  const taskTitle = `LOCAL assigned ${suffix}`;
  const contextA = await browser.newContext({ baseURL: BASE, locale: "ja-JP", timezoneId: "Asia/Tokyo", viewport: { width: 390, height: 844 } });
  const contextB = await browser.newContext({ baseURL: BASE, locale: "ja-JP", timezoneId: "Asia/Tokyo", viewport: { width: 390, height: 844 } });
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  let taskId;
  try {
    await register(pageA, owner);
    await createHousehold(pageA, householdName);
    const householdA = (await apiGet(pageA, "/api/households/current")).household;
    const inviteCode = await issueInvite(pageA);
    await register(pageB, member, inviteCode);
    const householdB = (await apiGet(pageB, "/api/households/current")).household;
    expect(householdB.id).toBe(householdA.id);
    const members = (await apiGet(pageA, "/api/households/current/members")).members;
    expect(members).toHaveLength(2);
    expect(members.some((entry) => entry.displayName === owner.displayName)).toBeTruthy();
    expect(members.some((entry) => entry.displayName === member.displayName)).toBeTruthy();
    await verifyNotificationSettings(pageA);

    const ownerState = await contextA.storageState();
    const memberState = await contextB.storageState();
    const recordingPages = await Promise.all([
      createAuthenticatedRecordingPage(browser, ownerState),
      createAuthenticatedRecordingPage(browser, memberState)
    ]);
    try {
      for (const { page } of recordingPages) {
        await navigateBottom(page, "ホーム", "/home", "やること");
        await navigateBottom(page, "カレンダー", "/calendar", "カレンダー");
        await navigateBottom(page, "買い物", "/shopping", "買い物");
        await navigateBottom(page, "その他", "/other", "その他");
        await navigateBottom(page, "ホーム", "/home", "やること");
      }
    } finally {
      await Promise.all(recordingPages.map(({ context }) => context.close()));
    }

    const task = await createAssignedTask(pageA, taskTitle, member.displayName);
    expect(task).toBeTruthy();
    taskId = task.id;
    await pageB.goto(`${BASE}/home`, { waitUntil: "domcontentloaded" });
    await expect(pageB.getByRole("button", { name: `${taskTitle}を完了`, exact: true })).toBeVisible();
    await pageB.getByRole("button", { name: `${taskTitle}を完了`, exact: true }).click();
    await expect(pageB.getByRole("button", { name: /完了済み/ })).toBeVisible();
    await pageA.reload();
    await pageA.getByRole("button", { name: /完了済み/ }).click();
    const completedRow = pageA.locator(".m2-home__history-list .m2-home__row", { hasText: taskTitle });
    await expect(completedRow).toBeVisible();
    await expect(completedRow.getByRole("img", { name: `完了者: ${member.displayName}` })).toBeVisible();
    const history = (await apiGet(pageA, `/api/tasks/${taskId}/history`)).records;
    expect(history.some((record) => record.taskTitleSnapshot === taskTitle && record.assignedUserDisplayNameSnapshot === member.displayName)).toBeTruthy();
    await apiMutate(pageA, "POST", `/api/tasks/${taskId}/restore`, { recordId: history.find((record) => record.status === "completed").id });
    await pageB.reload();
    await expect(pageB.getByRole("button", { name: `${taskTitle}を完了`, exact: true })).toBeVisible();
    await pageA.goto(`${BASE}/calendar`, { waitUntil: "domcontentloaded" });
    await expect(pageA.getByRole("grid", { name: /カレンダー/ })).toBeVisible();
    const cell = pageA.getByRole("gridcell", { name: new RegExp(`${Number(today.slice(5, 7))}月${Number(today.slice(8, 10))}日`) }).first();
    await expect(cell).toBeVisible();
    await cell.click();
    await expect(pageA.getByRole("dialog")).toBeVisible();
    await pageA.getByRole("button", { name: "閉じる", exact: true }).click();
  } finally {
    if (taskId) await apiMutate(pageA, "DELETE", `/api/tasks/${taskId}`).catch(() => undefined);
    await contextA.close();
    await contextB.close();
  }
}

const browser = await chromium.launch({ headless: true });
try {
  for (let index = 1; index <= 3; index += 1) await runOne(browser, index);
  console.log("local runner reproduction: 3/3 PASS");
} finally {
  await browser.close();
}
