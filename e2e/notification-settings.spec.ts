import { expect, test } from "@playwright/test";

const user = { id: "user-1", email: "notify@example.test", displayName: "Notify User" };
const household = {
  id: "house-1",
  name: "Notify House",
  timezone: "Asia/Tokyo",
  weekStartsOn: 1,
  role: "owner"
};

const installNotificationMock = async (
  page: import("@playwright/test").Page,
  options: { supported?: boolean; standaloneProperty?: boolean } = {}
) => {
  await page.addInitScript(
    ({ supported, standaloneProperty }) => {
      const subscription = {
        endpoint: "https://push.example.test/endpoint-1",
        toJSON: () => ({
          endpoint: "https://push.example.test/endpoint-1",
          keys: { p256dh: "AQID", auth: "BAUG" }
        }),
        unsubscribe: async () => true
      };
      const registration = {
        pushManager: {
          getSubscription: async () => null,
          subscribe: async () => subscription
        }
      };
      if (supported) {
        Object.defineProperty(navigator, "serviceWorker", {
          configurable: true,
          value: { getRegistration: async () => registration }
        });
        Object.defineProperty(window, "PushManager", {
          configurable: true,
          value: class PushManager {}
        });
      } else {
        Object.defineProperty(navigator, "serviceWorker", {
          configurable: true,
          value: undefined
        });
        Object.defineProperty(window, "PushManager", {
          configurable: true,
          value: undefined
        });
      }
      if (standaloneProperty)
        Object.defineProperty(navigator, "standalone", {
          configurable: true,
          value: false
        });
      Object.defineProperty(window, "Notification", {
        configurable: true,
        value: { permission: "default", requestPermission: async () => "granted" }
      });
    },
    {
      supported: options.supported ?? true,
      standaloneProperty: options.standaloneProperty ?? false
    }
  );
};

const mockApis = async (page: import("@playwright/test").Page) => {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/auth/me")
      return route.fulfill({ json: { ok: true, data: { user }, requestId: "req" } });
    if (url.pathname === "/api/households/current")
      return route.fulfill({
        json: { ok: true, data: { household }, requestId: "req" }
      });
    if (url.pathname === "/api/households/current/members")
      return route.fulfill({
        json: { ok: true, data: { members: [] }, requestId: "req" }
      });
    if (url.pathname === "/api/households/current/image-usage")
      return route.fulfill({
        json: {
          ok: true,
          data: {
            activeCount: 0,
            activeCountLimit: 50,
            activeBytes: 0,
            activeBytesLimit: 52428800,
            reservedCount: 0,
            reservedBytes: 0,
            pendingCleanupBytes: 0,
            pendingCleanupUnknownCount: 0,
            storedBytes: 0,
            storedBytesKnown: true,
            storedBytesLimit: 78643200,
            dailyUploadDate: null,
            dailyUploadCount: 0,
            dailyUploadLimit: 20
          },
          requestId: "req"
        }
      });
    if (url.pathname === "/api/notifications/vapid-public-key")
      return route.fulfill({
        json: { ok: true, data: { publicKey: "AQIDBA" }, requestId: "req" }
      });
    if (url.pathname === "/api/notifications/subscriptions")
      return route.fulfill({
        json: { ok: true, data: { registered: true, removed: true }, requestId: "req" }
      });
    return route.fulfill({
      status: 404,
      json: {
        ok: false,
        error: { code: "NOT_FOUND", message: "not found" },
        requestId: "req"
      }
    });
  });
};

test.describe("notification settings local fixture", () => {
  test("shows unsupported state without blocking the rest of settings", async ({
    page
  }) => {
    await installNotificationMock(page, { supported: false });
    await mockApis(page);
    await page.goto("/settings/members");
    await expect(page.getByText("このブラウザでは通知を利用できません")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "メンバー", exact: true })
    ).toBeVisible();
  });

  test("shows unsupported and supported enable/off states at responsive widths", async ({
    page
  }) => {
    await installNotificationMock(page);
    await mockApis(page);
    for (const width of [320, 390, 430, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/settings/members");
      await expect(
        page.getByRole("heading", { name: "通知", exact: true })
      ).toBeVisible();
      await expect(
        page
          .getByRole("heading", { name: "通知", exact: true })
          .locator("..")
          .getByText("未設定")
      ).toBeVisible();
      await page.getByRole("button", { name: "通知を有効にする" }).click();
      await expect(
        page
          .getByRole("heading", { name: "通知", exact: true })
          .locator("..")
          .getByText("通知ON")
      ).toBeVisible();
      await page.getByRole("button", { name: "通知をオフにする" }).click();
      await expect(
        page
          .getByRole("heading", { name: "通知", exact: true })
          .locator("..")
          .getByText("未設定")
      ).toBeVisible();
    }
  });

  test("shows home-screen guidance using capability state", async ({ page }) => {
    await installNotificationMock(page, { standaloneProperty: true });
    await mockApis(page);
    await page.goto("/settings/members");
    await expect(
      page.getByText(
        "iPhoneで通知を利用するには、HouseToDoをホーム画面に追加してください。"
      )
    ).toBeVisible();
  });
});
