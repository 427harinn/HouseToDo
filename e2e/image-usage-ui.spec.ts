import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const artifactRoot = process.env.PLAYWRIGHT_ARTIFACT_DIR ?? "artifacts/playwright/image-usage-ui";

const normalUsage = {
  activeCount: 3,
  activeCountLimit: 50,
  activeBytes: 12.4 * 1024 * 1024,
  activeBytesLimit: 50 * 1024 * 1024,
  reservedCount: 0,
  reservedBytes: 0,
  pendingCleanupBytes: 0,
  pendingCleanupUnknownCount: 0,
  storedBytes: 15.2 * 1024 * 1024,
  storedBytesKnown: true,
  storedBytesLimit: 75 * 1024 * 1024,
  dailyUploadDate: "2026-08-09",
  dailyUploadCount: 4,
  dailyUploadLimit: 20
};

const json = (data: unknown) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({ ok: true, data, requestId: "e2e-image-usage" })
});

const setupApiMocks = async (page: Page, usage = normalUsage) => {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/auth/me") return route.fulfill(json({ user: { id: "user-1", email: "e2e@example.test", displayName: "E2E User" } }));
    if (url.pathname === "/api/households/current") return route.fulfill(json({ household: {
      id: "household-1", name: "E2E household", timezone: "Asia/Tokyo", weekStartsOn: 1, role: "owner"
    } }));
    if (url.pathname === "/api/households/current/members") return route.fulfill(json({ members: [
      { userId: "user-1", displayName: "E2E User", role: "owner", color: "#d9f2eb", joinedAt: "2026-08-01T00:00:00Z" }
    ] }));
    if (url.pathname === "/api/households/current/image-usage") return route.fulfill(json(usage));
    return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ ok: false, error: { code: "NOT_FOUND", message: "not found" } }) });
  });
};

const screenshot = async (page: Page, name: string) => {
  await mkdir(artifactRoot, { recursive: true });
  await page.screenshot({ path: path.resolve(artifactRoot, name), fullPage: true });
};

const expectNoHorizontalScroll = async (page: Page) => {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
};

test.describe("image usage UI", () => {
  test("renders normal usage at desktop and mobile sizes", async ({ page }) => {
    await setupApiMocks(page);
    await page.goto("/settings/members");
    await expect(page.getByRole("heading", { name: "画像ストレージ" })).toBeVisible();
    await expect(page.getByText("3 / 50 枚")).toBeVisible();
    await expect(page.getByText("12.4 MB / 50 MB")).toBeVisible();
    await expect(page.getByText("15.2 MB / 75 MB")).toBeVisible();
    await expect(page.getByText("4 / 20 回")).toBeVisible();

    for (const [name, size] of [
      ["normal-desktop.png", { width: 1280, height: 800 }],
      ["normal-430.png", { width: 430, height: 932 }],
      ["normal-390.png", { width: 390, height: 844 }],
      ["normal-320.png", { width: 320, height: 568 }]
    ] as const) {
      await page.setViewportSize(size);
      await expectNoHorizontalScroll(page);
      await screenshot(page, name);
    }
  });

  test("renders the warning state from a local fixture", async ({ page }) => {
    await setupApiMocks(page, {
      ...normalUsage,
      activeCount: 50,
      activeBytes: 40 * 1024 * 1024,
      storedBytes: 60 * 1024 * 1024,
      dailyUploadCount: 16,
      pendingCleanupBytes: 2.3 * 1024 * 1024,
      pendingCleanupUnknownCount: 1,
      storedBytesKnown: false,
      reservedCount: 1,
      reservedBytes: 1024
    });
    await page.goto("/settings/members");
    await expect(page.getByText("画像数の上限に達しています。")).toBeVisible();
    await expect(page.getByText("削除処理待ちの画像があるため、保存容量を正確に確認できません。")).toBeVisible();
    await screenshot(page, "warning-desktop.png");
  });
});
