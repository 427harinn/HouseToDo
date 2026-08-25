/* global window, navigator, location, document, HTMLElement, getComputedStyle */
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const gitRoot = root.replace(/[\\/]+$/, "");
const evidence = fileURLToPath(new URL("../docs/evidence/m5/", import.meta.url));
const fixtureImage = fileURLToPath(new URL("../e2e/fixtures/shopping-item-portrait.png", import.meta.url));
const production = process.env.M5_PRODUCTION_URL ?? "http://127.0.0.1:5174";
const mockup = process.env.M5_MOCKUP_URL ?? "http://127.0.0.1:5176";
const mockupSha = "db8941dc3056f07862014242a349ae366da59e9c";
const json = (data, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify({ ok: true, data, requestId: "m5-evidence" }) });

const baseSettings = {
  eveningSummaryEnabled: true,
  eveningSummaryTime: "21:00",
  morningSummaryEnabled: true,
  morningSummaryTime: "09:00",
  timezone: "Asia/Tokyo"
};

async function installNotificationFixture(page) {
  await page.addInitScript(() => {
    const deviceOff = new URL(location.href).searchParams.get("fixture") === "device-off";
    Object.defineProperty(window, "Notification", { configurable: true, value: { permission: "granted", requestPermission: async () => "granted" } });
    window.PushManager = function PushManager() {};
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { getRegistration: async () => ({ pushManager: {
      getSubscription: async () => deviceOff ? null : ({ endpoint: "https://push.example.test/m5", toJSON: () => ({ endpoint: "https://push.example.test/m5", keys: { p256dh: "fixture", auth: "fixture" } }), unsubscribe: async () => true }),
      subscribe: async () => ({ endpoint: "https://push.example.test/m5", toJSON: () => ({ endpoint: "https://push.example.test/m5", keys: { p256dh: "fixture", auth: "fixture" } }), unsubscribe: async () => true })
    } }) } });
  });
}

async function mockProduction(page) {
  const image = await fs.readFile(fixtureImage);
  const avatarData = `data:image/png;base64,${image.toString("base64")}`;
  let profile = { id: "user-1", email: "haru@example.test", displayName: "はる", avatarUrl: null };
  let household = { id: "house-1", name: "Evidence House", timezone: "Asia/Tokyo", weekStartsOn: 1, role: "owner" };
  let settings = { ...baseSettings };
  await installNotificationFixture(page);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const fixture = new URL(page.url()).searchParams.get("fixture") ?? "normal";
    if (fixture === "photo-selected") profile = { ...profile, avatarUrl: avatarData };
    if (url.pathname === "/api/auth/me") return route.fulfill(json({ user: profile }));
    if (url.pathname === "/api/households/current" && request.method() === "GET") return route.fulfill(json({ household }));
    if (url.pathname === "/api/households/current" && request.method() === "PATCH") {
      const body = request.postDataJSON();
      household = { ...household, ...body };
      return route.fulfill(json({ household }));
    }
    if (url.pathname === "/api/households/current/members") return route.fulfill(json({ members: [
      { userId: "user-1", displayName: profile.displayName, role: "owner", color: "#d9f2eb", avatarUrl: profile.avatarUrl, joinedAt: "2026-08-01T00:00:00.000Z" },
      { userId: "user-2", displayName: "たくや", role: "member", color: "#e4eef8", avatarUrl: null, joinedAt: "2026-08-02T00:00:00.000Z" }
    ] }));
    if (url.pathname === "/api/households/current/invites" && request.method() === "POST") return route.fulfill(json({ invite: { code: "HOUSE-M5-4821", expiresAt: "2026-08-26T00:00:00.000Z" } }, 201));
    if (url.pathname === "/api/notifications/settings" && request.method() === "GET") {
      if (fixture === "morning-off") settings = { ...baseSettings, morningSummaryEnabled: false };
      if (fixture === "all-schedule-off") settings = { ...baseSettings, morningSummaryEnabled: false, eveningSummaryEnabled: false };
      return route.fulfill(json(settings));
    }
    if (url.pathname === "/api/notifications/settings" && request.method() === "PATCH") { settings = request.postDataJSON(); return route.fulfill(json(settings)); }
    if (url.pathname === "/api/notifications/vapid-public-key") return route.fulfill(json({ publicKey: "BElocalfixture" }));
    if (url.pathname === "/api/notifications/subscriptions") return route.fulfill(json({ registered: true, removed: true }));
    if (url.pathname === "/api/account/profile" && request.method() === "PATCH") { profile = { ...profile, displayName: request.postDataJSON().displayName }; return route.fulfill(json({ user: profile })); }
    if (url.pathname === "/api/account/avatar" && request.method() === "PUT") { profile = { ...profile, avatarUrl: avatarData }; return route.fulfill(json({ avatarUrl: profile.avatarUrl })); }
    if (url.pathname === "/api/account/avatar" && request.method() === "DELETE") { profile = { ...profile, avatarUrl: null }; return route.fulfill(json({ deleted: true, avatarUrl: null })); }
    if (url.pathname === "/api/households/current/image-usage") {
      const near = fixture === "near-limit";
      const storedBytesLimit = 92 * 1024 * 1024;
      const storedBytes = near ? 86 * 1024 * 1024 : 12 * 1024 * 1024;
      const unknown = fixture === "unknown";
      return route.fulfill(json({ activeCount: 1, activeCountLimit: 50, activeBytes: storedBytes, activeBytesLimit: storedBytesLimit, reservedCount: 0, reservedBytes: 0, pendingCleanupBytes: near || unknown ? 3 * 1024 * 1024 : 0, pendingCleanupUnknownCount: near || unknown ? 1 : 0, storedBytes, storedBytesKnown: !unknown, storedBytesLimit, dailyUploadDate: "2026-08-25", dailyUploadCount: 1, dailyUploadLimit: 20 }));
    }
    if (url.pathname === "/api/dashboard/today") return route.fulfill(json({ date: "2026-08-25", household: { id: household.id, name: household.name }, summary: { total: 0, pending: 0, inProgress: 0, completed: 0, skipped: 0 }, todayTasks: [], weeklyTasks: [], shopping: { pendingCount: 0, previewItems: [] }, members: [] }));
    return route.fulfill(json({}));
  });
}

const settle = async (page) => { await page.waitForTimeout(350); await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur()); await page.mouse.move(1, 1); };
const assert = (condition, message) => { if (!condition) throw new Error(`M5 evidence assertion failed: ${message}`); };
const grantClipboard = async (page) => page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(production).origin });

async function productionShot(browser, name, route, fixture, interact) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await mockProduction(page);
  await page.goto(`${production}${route}?fixture=${encodeURIComponent(fixture)}`, { waitUntil: "networkidle" });
  await page.getByRole("heading").first().waitFor();
  if (interact) await interact(page);
  if (fixture === "invite-open") await page.getByRole("dialog", { name: "メンバーを招待" }).waitFor();
  const detail = route !== "/other";
  assert((await page.getByRole("navigation", { name: "主要画面" }).count()) === (detail ? 0 : 1), `${route} bottom navigation parity`);
  if (route === "/other/members" && fixture === "normal") assert(await page.getByText("はる", { exact: true }).count() === 1, "member display name");
  if (fixture === "invite-open") assert(await page.getByRole("dialog", { name: "メンバーを招待" }).count() === 1 && await page.getByText("HOUSE-M5-4821", { exact: true }).count() === 1, "invite sheet state");
  if (route === "/other/notifications") {
    const morning = page.getByRole("checkbox", { name: "朝のまとめ通知" });
    const evening = page.getByRole("checkbox", { name: "夜のまとめ通知" });
    if (fixture === "morning-off") assert(!(await morning.isChecked()) && await page.getByRole("textbox", { name: "朝のまとめ通知の時刻" }).count() === 0, "morning-off state");
    if (fixture === "all-schedule-off") assert(!(await morning.isChecked()) && !(await evening.isChecked()) && await page.getByRole("textbox", { name: /時刻/ }).count() === 0, "all-schedule-off state");
    if (fixture === "device-off") assert(await page.getByRole("textbox", { name: "朝のまとめ通知の時刻" }).count() === 1 && await page.getByRole("textbox", { name: "朝のまとめ通知の時刻" }).isDisabled(), "device-off state");
  }
  if (route === "/other/storage") assert(await page.getByRole("progressbar").count() === 1, "storage progressbar");
  if (route === "/other/storage" && fixture === "unknown") assert(await page.getByText("確認中", { exact: true }).count() >= 1 && await page.getByText(/正確に確認できません/).count() === 1, "storage unknown state");
  if (fixture === "timezone-open") assert(await page.getByRole("dialog", { name: "タイムゾーン" }).count() === 1, "timezone sheet state");
  if (fixture === "saved") assert(await page.getByRole("status").getByText("保存しました").count() === 1, "household saved state");
  if (fixture === "photo-selected") assert(await page.getByRole("img", { name: /アバター/ }).count() === 1, "account avatar state");
  if (fixture === "logout-confirm") assert(await page.getByRole("dialog", { name: "ログアウトしますか？" }).count() === 1, "logout confirmation state");
  await settle(page);
  const rowButtons = page.locator(".m5-row-button");
  if (await rowButtons.count()) assert(await rowButtons.evaluateAll((elements) => elements.every((element) => { const style = getComputedStyle(element); return style.borderTopStyle === "none" && style.borderLeftStyle === "none" && style.borderRightStyle === "none" && style.borderBottomStyle !== "none"; })), `${route} flat row border parity`);
  if (fixture === "timezone-open") assert(await page.locator(".m5-selection-list button svg").first().evaluate((element) => getComputedStyle(element).color !== "rgb(0, 0, 0)"), "timezone selected icon color");
  await page.screenshot({ path: `${evidence}/production/${name}.png`, fullPage: true });
  await page.close();
}

async function mockupShot(browser, name, route, state, interact) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await page.goto(`${mockup}/#${route}?uilabState=${encodeURIComponent(state)}`, { waitUntil: "networkidle" });
  await page.locator("[data-uilab-component]").first().waitFor();
  if (interact) await interact(page);
  assert((await page.locator('[data-uilab-component="AppShell.BottomNavigation"]').count()) === (route === "/other" ? 1 : 0), `${route} Mockup bottom navigation parity`);
  if (route === "/other/notifications" && state === "device-off") assert(await page.locator('[data-uilab-id="notifications-morning-time"] input').isDisabled(), "Mockup device-off semantics");
  if (route === "/other/notifications" && state === "morning-off") assert(await page.locator('[data-uilab-id="notifications-morning-time"]').count() === 0, "Mockup morning-off semantics");
  if (route === "/other/notifications" && state === "all-schedule-off") assert(await page.locator('[data-uilab-id="notifications-morning-time"]').count() === 0 && await page.locator('[data-uilab-id="notifications-evening-time"]').count() === 0, "Mockup all-schedule-off semantics");
  if (route === "/other/household" && state === "timezone-open") assert(await page.locator('[data-uilab-id="household-timezone-sheet"]').count() === 1, "Mockup timezone sheet");
  if (route === "/other/account" && state === "logout-confirm") assert(await page.locator('[data-uilab-id="account-logout-confirm"]').count() === 1, "Mockup logout sheet");
  await settle(page);
  await page.screenshot({ path: `${evidence}/mockup/${name}.png`, fullPage: true });
  await page.close();
}

async function recordMotion(browser, name, route, setup) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, recordVideo: { dir: `${evidence}/motion`, size: { width: 390, height: 844 } } });
  const page = await context.newPage();
  await grantClipboard(page);
  await mockProduction(page);
  await page.goto(`${production}${route}?fixture=normal`, { waitUntil: "networkidle" });
  await page.getByRole("heading").first().waitFor();
  await page.waitForTimeout(450);
  await setup(page);
  await page.waitForTimeout(700);
  const video = page.video();
  await context.close();
  if (video) await video.saveAs(`${evidence}/motion/${name}.webm`);
}

await fs.rm(evidence, { recursive: true, force: true });
await Promise.all(["production", "mockup", "motion", "motion/previews", "review-upload"].map((name) => fs.mkdir(`${evidence}/${name}`, { recursive: true })));
const browser = await chromium.launch({ headless: true });

await productionShot(browser, "01-other-normal", "/other", "normal");
await productionShot(browser, "02-members-normal", "/other/members", "normal");
await productionShot(browser, "03-members-invite-open", "/other/members", "invite-open", async (page) => page.getByRole("button", { name: "招待する" }).click());
await productionShot(browser, "04-notifications-normal", "/other/notifications", "normal");
await productionShot(browser, "05-notifications-device-off", "/other/notifications", "device-off");
await productionShot(browser, "06-notifications-morning-off", "/other/notifications", "morning-off");
await productionShot(browser, "07-notifications-all-schedule-off", "/other/notifications", "all-schedule-off");
await productionShot(browser, "08-storage-normal", "/other/storage", "normal");
await productionShot(browser, "09-storage-near-limit", "/other/storage", "near-limit");
await productionShot(browser, "16-storage-unknown", "/other/storage", "unknown");
await productionShot(browser, "10-household-normal", "/other/household", "normal");
await productionShot(browser, "11-household-timezone-open", "/other/household", "timezone-open", async (page) => page.getByRole("button", { name: /タイムゾーン/ }).click());
await productionShot(browser, "12-household-saved", "/other/household", "saved", async (page) => { await page.getByRole("textbox", { name: "家庭名" }).fill("Saved Evidence House"); await page.getByRole("button", { name: "保存" }).click(); await page.getByRole("status").getByText("保存しました").waitFor(); });
await productionShot(browser, "13-account-normal", "/other/account", "normal");
await productionShot(browser, "14-account-photo-selected", "/other/account", "photo-selected");
await productionShot(browser, "15-account-logout-confirm", "/other/account", "logout-confirm", async (page) => page.getByRole("button", { name: "ログアウト" }).click());

await mockupShot(browser, "01-other-normal", "/other", "normal");
await mockupShot(browser, "02-members-normal", "/other/members", "normal");
await mockupShot(browser, "03-members-invite-open", "/other/members", "invite-open");
await mockupShot(browser, "04-notifications-normal", "/other/notifications", "normal");
await mockupShot(browser, "05-notifications-device-off", "/other/notifications", "device-off");
await mockupShot(browser, "06-notifications-morning-off", "/other/notifications", "morning-off");
await mockupShot(browser, "07-notifications-all-schedule-off", "/other/notifications", "all-schedule-off");
await mockupShot(browser, "08-storage-normal", "/other/storage", "normal");
await mockupShot(browser, "09-storage-near-limit", "/other/storage", "near-limit");
await mockupShot(browser, "10-household-normal", "/other/household", "normal");
await mockupShot(browser, "11-household-timezone-open", "/other/household", "timezone-open");
await mockupShot(browser, "12-household-saved", "/other/household", "saved");
await mockupShot(browser, "13-account-normal", "/other/account", "normal");
await mockupShot(browser, "14-account-photo-selected", "/other/account", "photo-selected");
await mockupShot(browser, "15-account-logout-confirm", "/other/account", "logout-confirm");

await recordMotion(browser, "members-invite", "/other/members", async (page) => { await page.getByRole("button", { name: "招待する" }).click(); await page.getByRole("button", { name: "コードをコピー" }).click(); await page.getByRole("status").getByText("コードをコピーしました", { exact: true }).waitFor(); await page.getByRole("button", { name: "閉じる", exact: true }).click(); });
await recordMotion(browser, "notifications-settings", "/other/notifications", async (page) => {
  const morning = page.getByRole("checkbox", { name: "朝のまとめ通知" });
  if (await morning.isChecked()) await morning.uncheck();
  await morning.check();
  const time = page.getByRole("textbox", { name: "朝のまとめ通知の時刻" });
  await time.fill("08:30"); await time.blur();
  const device = page.getByRole("checkbox", { name: "この端末の通知" });
  await device.click(); await page.waitForTimeout(350); await device.click();
});
await recordMotion(browser, "household-settings", "/other/household", async (page) => { await page.getByRole("button", { name: /タイムゾーン/ }).click(); await page.getByRole("button", { name: "America/Los_Angeles" }).click(); await page.getByRole("textbox", { name: "家庭名" }).fill("Motion House"); await page.getByRole("button", { name: "保存" }).click(); await page.getByRole("status").getByText("保存しました").waitFor(); });
await recordMotion(browser, "account-actions", "/other/account", async (page) => { const fixture = fixtureImage; await page.getByRole("button", { name: "プロフィール画像を変更" }).click(); await page.getByRole("button", { name: "写真を選択" }).click(); await page.locator('input[type="file"]').setInputFiles(fixture); await page.waitForTimeout(500); await page.getByRole("button", { name: "プロフィール画像を変更" }).click(); await page.getByRole("button", { name: "初期状態に戻す" }).click(); await page.getByRole("button", { name: "ログアウト" }).click(); await page.getByRole("button", { name: "キャンセル" }).click(); });

await browser.close();
const productionSha = (await execFileAsync("git", ["-c", `safe.directory=${gitRoot.replaceAll("\\", "/")}`, "rev-parse", "HEAD"], { cwd: root })).stdout.trim();
await fs.writeFile(`${evidence}/capture-metadata.json`, JSON.stringify({ productionSha, mockupSha, viewport: "390x844", states: 16, source: "scripts/capture-m5-evidence.mjs" }, null, 2));
console.log(`M5 evidence captured at ${evidence} for Production ${productionSha} and Mockup ${mockupSha}`);
