import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { readFile } from "node:fs/promises";

const artifactRoot = process.env.PLAYWRIGHT_ARTIFACT_DIR ?? "artifacts/playwright/image-upload-ux";
const fixture = (name: string) => path.resolve("e2e/fixtures", name);

const usage = {
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

const json = (data: unknown, status = 200) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify({ ok: true, data, requestId: "e2e-image-upload-ux" })
});

const failure = (code: string, status = 409) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify({ ok: false, error: { code, message: "internal" }, requestId: "e2e-image-upload-ux" })
});

const setupApi = async (page: Page, imageUsage = usage, uploadError?: string, withImage = false) => {
  let usageReads = 0;
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/auth/me") return route.fulfill(json({ user: { id: "user-1", email: "e2e@example.test", displayName: "E2E User" } }));
    if (url.pathname === "/api/households/current") return route.fulfill(json({ household: { id: "household-1", name: "E2E household", timezone: "Asia/Tokyo", weekStartsOn: 1, role: "owner" } }));
    if (url.pathname === "/api/households/current/members") return route.fulfill(json({ members: [] }));
    if (url.pathname === "/api/households/current/image-usage") {
      usageReads += 1;
      return route.fulfill(json(imageUsage));
    }
    if (url.pathname === "/api/shopping/recent") {
      return route.fulfill(json({ items: [{ name: "牛乳", quantity: "1本", note: "いつもの銘柄", createdAt: "2026-08-09T00:00:00Z" }] }));
    }
    if (url.pathname === "/api/shopping/templates") {
      return route.fulfill(json({ templates: [{ id: "template-1", name: "トイレットペーパー", quantity: "1パック", note: null, active: true, sortOrder: 1, createdBy: "user-1", createdAt: "2026-08-09T00:00:00Z", updatedAt: "2026-08-09T00:00:00Z" }] }));
    }
    if (url.pathname === "/api/shopping/items/item-1" && route.request().method() === "GET") {
      return route.fulfill(json({ item: { id: "item-1", name: "牛乳", quantity: null, note: null, status: "pending", addedBy: "user-1", purchasedBy: null, purchasedAt: null, sortOrder: 1, createdAt: "2026-08-09T00:00:00Z", updatedAt: "2026-08-09T00:00:00Z", image: withImage ? { updatedAt: "2026-08-09T00:00:00Z" } : null } }));
    }
    if (url.pathname === "/api/shopping/items" && route.request().method() === "POST") return route.fulfill(json({ item: { id: "item-1" } }));
    if (url.pathname === "/api/shopping/items/item-1" && route.request().method() === "PATCH") return route.fulfill(json({ item: { id: "item-1" } }));
    if (url.pathname === "/api/shopping/items/item-1/image" && route.request().method() === "PUT") return route.fulfill(uploadError ? failure(uploadError) : json({ item: { id: "item-1" } }));
    if (url.pathname === "/api/shopping/items/item-1/image" && route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "image/webp", body: await readFile(fixture("shopping-item-replacement.webp")) });
    if (url.pathname === "/api/shopping/items/item-1/image" && route.request().method() === "DELETE") return route.fulfill(json({}));
    return route.fulfill(failure("NOT_FOUND", 404));
  });
  return () => usageReads;
};

const screenshot = async (page: Page, name: string) => {
  await mkdir(artifactRoot, { recursive: true });
  await page.screenshot({ path: path.resolve(artifactRoot, name), fullPage: true });
};

test.describe("shopping image upload UX", () => {
  test.beforeEach(async ({ page }) => {
    page.on("pageerror", (error) => console.error(`[pageerror] ${error.stack ?? error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error" && !message.text().includes("status of 409")) console.error(`[console.error] ${message.text()}`);
    });
    page.on("requestfailed", (request) => {
      if (request.failure()?.errorText !== "net::ERR_ABORTED") console.error(`[requestfailed] ${request.url()} ${request.failure()?.errorText ?? "unknown"}`);
    });
  });

  test("recent/template prefill and library input share preview flow", async ({ page }) => {
    await setupApi(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/shopping/new");
    await expect(page.getByRole("heading", { name: "最近使ったもの" })).toBeVisible();
    await screenshot(page, "shopping-recent-mobile.png");

    await page.getByRole("button", { name: /牛乳/ }).click();
    await expect(page.locator("#shopping-name")).toHaveValue("牛乳");
    await page.getByRole("button", { name: /トイレットペーパー/ }).click();
    await expect(page.locator("#shopping-name")).toHaveValue("トイレットペーパー");
    await screenshot(page, "shopping-template-prefill.png");

    await expect(page.getByRole("button", { name: "写真を撮る", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "写真を選ぶ", exact: true })).toBeVisible();
    await expect(page.locator("#shopping-image-camera")).toHaveCount(0);
    await expect(page.locator("#shopping-image")).not.toHaveAttribute("capture");
    await expect(page.locator("#shopping-image")).toHaveAttribute("accept", "image/*");
    await screenshot(page, "shopping-image-options-mobile.png");
    await page.locator("#shopping-image").setInputFiles(fixture("shopping-item-portrait.png"));
    await expect(page.locator(".shopping-image-preview")).toBeVisible();
    await screenshot(page, "shopping-image-preview.png");
    await page.getByRole("button", { name: "選択解除" }).click();
    await expect(page.locator(".shopping-image-preview")).toHaveCount(0);
    await page.locator("#shopping-image").setInputFiles(fixture("shopping-item-portrait.png"));
    await expect(page.locator(".shopping-image-preview")).toBeVisible();
    await page.getByRole("button", { name: "保存" }).click();
    await expect(page).toHaveURL(/\/shopping\?item=item-1$/);
  });

  test("normal upload shows usage and refreshes it after success", async ({ page }) => {
    const usageReads = await setupApi(page);
    await page.goto("/shopping/new");
    await expect(page.getByText("残り画像 47枚")).toBeVisible();
    await expect(page.getByText("本日あと 16回")).toBeVisible();
    await page.locator("#shopping-image").setInputFiles(fixture("shopping-item-landscape.jpg"));
    await expect(page.locator(".shopping-image-preview")).toBeVisible();
    await page.locator("#shopping-name").fill("牛乳");
    await page.getByRole("button", { name: "保存" }).click();
    await expect(page).toHaveURL(/\/shopping\/items\/item-1$/);
    expect(usageReads()).toBeGreaterThanOrEqual(2);
    await screenshot(page, "image-upload-normal-desktop.png");
  });

  test("near limit, unknown storage, backend limit error, and replace remain understandable", async ({ page }) => {
    await setupApi(page, { ...usage, activeCount: 40, activeBytes: 40 * 1024 * 1024, storedBytesKnown: false }, "IMAGE_ACTIVE_BYTES_LIMIT_REACHED", true);
    await page.goto("/shopping/new");
    await expect(page.getByText("画像保存容量が少なくなっています")).toBeVisible();
    await expect(page.getByText("保存容量を正確に確認できません")).toBeVisible();
    await screenshot(page, "image-upload-near-limit-desktop.png");
    await page.locator("#shopping-image").setInputFiles(fixture("shopping-item-landscape.jpg"));
    await page.locator("#shopping-name").fill("牛乳");
    await page.getByRole("button", { name: "保存" }).click();
    await expect(page.getByText("画像の使用容量が上限に達しています。", { exact: false })).toBeVisible();
    await screenshot(page, "image-upload-limit-error-desktop.png");
    await page.goto("/shopping/items/item-1/edit");
    await expect(page.locator("#shopping-image")).toBeEnabled();
    await screenshot(page, "image-upload-unknown-storage-desktop.png");
  });

  test("create count limit disables selection and mobile layouts do not overflow", async ({ page }) => {
    await setupApi(page, { ...usage, activeCount: 50 });
    await page.goto("/shopping/new");
    await expect(page.getByText("画像の追加上限に達しています")).toBeVisible();
    await expect(page.locator("#shopping-image")).toBeDisabled();
    for (const [name, width] of [["image-upload-430.png", 430], ["image-upload-390.png", 390], ["image-upload-320.png", 320]] as const) {
      await page.setViewportSize({ width, height: 800 });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
      await screenshot(page, name);
    }
  });

  test("replace stays available at count limit and refreshes usage after success", async ({ page }) => {
    const usageReads = await setupApi(page, { ...usage, activeCount: 50 }, undefined, true);
    await page.goto("/shopping/items/item-1/edit");
    await expect(page.locator("#shopping-image")).toBeEnabled();
    await page.locator("#shopping-image").setInputFiles(fixture("shopping-item-replacement.webp"));
    await page.getByRole("button", { name: "保存" }).click();
    await expect(page).toHaveURL(/\/shopping\/items\/item-1$/);
    expect(usageReads()).toBeGreaterThanOrEqual(2);
  });
});
