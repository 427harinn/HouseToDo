import { expect, test } from "@playwright/test";

const envelope = (data: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify({ ok: true, data, requestId: "m5-e2e" }) });

async function mockM5Api(page: import("@playwright/test").Page) {
  let household = { id: "house-1", name: "わが家", timezone: "Asia/Tokyo", weekStartsOn: 1, role: "owner" };
  let user = { id: "user-1", email: "haru@example.test", displayName: "はる", avatarUrl: null };
  let notifications = { morningSummaryEnabled: true, morningSummaryTime: "09:00", eveningSummaryEnabled: true, eveningSummaryTime: "21:00", timezone: "Asia/Tokyo" };
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/auth/me") return route.fulfill(envelope({ user }));
    if (url.pathname === "/api/households/current" && request.method() === "GET") return route.fulfill(envelope({ household }));
    if (url.pathname === "/api/households/current" && request.method() === "PATCH") { household = { ...household, ...request.postDataJSON() }; return route.fulfill(envelope({ household })); }
    if (url.pathname === "/api/households/current/members") return route.fulfill(envelope({ members: [{ userId: "user-1", displayName: user.displayName, role: "owner", color: "#d9f2eb", avatarUrl: user.avatarUrl }, { userId: "user-2", displayName: "たくや", role: "member", color: "#e4eef8", avatarUrl: null }] }));
    if (url.pathname === "/api/households/current/invites") return route.fulfill(envelope({ invite: { code: "HOUSE-M5-TEST", expiresAt: "2026-08-26T00:00:00.000Z" } }, 201));
    if (url.pathname === "/api/notifications/settings" && request.method() === "GET") return route.fulfill(envelope(notifications));
    if (url.pathname === "/api/notifications/settings" && request.method() === "PATCH") { notifications = request.postDataJSON(); return route.fulfill(envelope(notifications)); }
    if (url.pathname === "/api/notifications/subscriptions") return route.fulfill(envelope({ registered: true, removed: true }));
    if (url.pathname === "/api/notifications/vapid-public-key") return route.fulfill(envelope({ publicKey: "BElocalfixture" }));
    if (url.pathname === "/api/households/current/image-usage") return route.fulfill(envelope({ storedBytes: 12 * 1024 * 1024, storedBytesLimit: 92 * 1024 * 1024, storedBytesKnown: true, pendingCleanupBytes: 0, pendingCleanupUnknownCount: 0 }));
    if (url.pathname === "/api/account/profile" && request.method() === "PATCH") { user = { ...user, displayName: request.postDataJSON().displayName }; return route.fulfill(envelope({ user })); }
    if (url.pathname === "/api/auth/logout" && request.method() === "POST") return route.fulfill(envelope({}));
    if (url.pathname === "/api/dashboard/today") return route.fulfill(envelope({ date: "2026-08-25", household: { id: household.id, name: household.name }, summary: { total: 0, pending: 0, inProgress: 0, completed: 0, skipped: 0 }, todayTasks: [], weeklyTasks: [], shopping: { pendingCount: 0, previewItems: [] }, members: [] }));
    return route.fulfill(envelope({}));
  });
}

test.describe("M5 Other / Settings", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: process.env.PLAYWRIGHT_BASE_URL ?? "http://app:5173" });
    await page.addInitScript(() => {
      Object.defineProperty(window, "Notification", { configurable: true, value: { permission: "granted", requestPermission: async () => "granted" } });
      window.PushManager = function PushManager() {};
      Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { getRegistration: async () => ({ pushManager: { getSubscription: async () => ({ endpoint: "https://push.example.test/m5", toJSON: () => ({ endpoint: "https://push.example.test/m5", keys: { p256dh: "fixture", auth: "fixture" } }) }), subscribe: async () => null } }) } });
    });
    await mockM5Api(page);
    await page.goto("/other");
  });

  test("uses /other as the primary nav and hides nav on detail routes", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "その他" })).toBeVisible();
    await expect(page.getByRole("button", { name: "その他" })).toHaveAttribute("aria-current", "page");
    await page.getByRole("link", { name: "メンバー" }).click();
    await expect(page).toHaveURL(/\/other\/members$/);
    await expect(page.getByRole("heading", { name: "メンバー" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "主要画面" })).toHaveCount(0);
    await page.getByRole("button", { name: "戻る" }).click();
    await expect(page).toHaveURL(/\/other$/);
  });

  test("renders actual members and creates/copies an invite", async ({ page }) => {
    await page.goto("/other/members");
    await expect(page.getByText("たくや", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "招待する" }).click();
    await expect(page.getByRole("dialog", { name: "メンバーを招待" })).toContainText("HOUSE-M5-TEST");
    await page.getByRole("button", { name: "コードをコピー" }).click();
    await expect(page.getByRole("status")).toContainText("コードをコピーしました");
  });

  test("shows a safe fallback when clipboard write is rejected", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("clipboard rejected"); } } });
    });
    await page.goto("/other/members");
    await page.getByRole("button", { name: "招待する" }).click();
    await page.getByRole("dialog", { name: "メンバーを招待" }).getByRole("button", { name: "コードをコピー" }).click();
    await expect(page.getByRole("status")).toContainText("コードをコピーできませんでした。コードを選択してコピーしてください。");
  });

  test("persists schedule and household changes without a visible schedule save button", async ({ page }) => {
    await page.goto("/other/notifications");
    await expect(page.getByRole("checkbox", { name: "朝のまとめ通知" })).toBeChecked();
    await page.getByRole("checkbox", { name: "朝のまとめ通知" }).uncheck();
    await expect(page.getByRole("textbox", { name: "朝のまとめ通知の時刻" })).toHaveCount(0);
    await page.goto("/other/household");
    await page.getByRole("textbox", { name: "家庭名" }).fill("更新した家庭");
    await page.getByRole("button", { name: "保存" }).click();
    await expect(page.getByRole("status")).toContainText("保存しました");
    await expect(page.getByRole("textbox", { name: "家庭名" })).toHaveValue("更新した家庭");
  });

  test("keeps email read-only and persists display name", async ({ page }) => {
    await page.goto("/other/account");
    await expect(page.getByRole("textbox", { name: "メール" })).toHaveAttribute("readonly", "");
    const name = page.getByRole("textbox", { name: "表示名" });
    const profilePatches: string[] = [];
    page.on("request", (request) => { if (request.method() === "PATCH" && new URL(request.url()).pathname === "/api/account/profile") profilePatches.push(request.postData() ?? ""); });
    await name.fill("新しい名前");
    await name.press("Enter");
    await expect(page.getByRole("status")).toContainText("保存しました");
    await expect.poll(() => profilePatches.length).toBe(1);
    await name.fill("blurで保存");
    await name.blur();
    await expect(page.getByRole("status")).toContainText("保存しました");
    await expect.poll(() => profilePatches.length).toBe(2);
  });

  test("confirms logout, keeps cancel safe, and returns to login after success", async ({ page }) => {
    await page.goto("/other/account");
    await page.getByRole("button", { name: "ログアウト" }).click();
    const dialog = page.getByRole("dialog", { name: "ログアウトしますか？" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "キャンセル" }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole("button", { name: "ログアウト" }).click();
    await dialog.getByRole("button", { name: "ログアウト" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});
