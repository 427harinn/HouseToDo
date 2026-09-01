import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const artifactRoot = process.env.PLAYWRIGHT_ARTIFACT_DIR ?? "artifacts/playwright/profile-image-crop";
mkdirSync(artifactRoot, { recursive: true });

const portraitFixture = join(process.cwd(), "e2e", "fixtures", "shopping-item-portrait.png");
const landscapeFixture = join(process.cwd(), "e2e", "fixtures", "shopping-item-landscape.jpg");

const envelope = (data: unknown, status = 200) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify({ ok: true, data, requestId: "profile-image-crop-e2e" })
});

const failure = (code: string, status: number) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify({ ok: false, error: { code, message: "error" }, requestId: "profile-image-crop-e2e" })
});

const user = { id: "user-profile-crop", email: "crop@example.test", displayName: "Crop User", avatarUrl: null as string | null };
const household = { id: "household-profile-crop", name: "Crop House", timezone: "Asia/Tokyo", weekStartsOn: 1, role: "owner" as const };

const setupApi = async (page: Page) => {
  let registered = false;
  let registerCount = 0;
  let householdCreated = false;
  let avatarUploaded = false;
  let avatarUrl: string | null = null;
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/auth/me") {
      return route.fulfill(registered ? envelope({ user: { ...user, avatarUrl } }) : failure("UNAUTHENTICATED", 401));
    }
    if (url.pathname === "/api/auth/register") {
      registerCount += 1;
      registered = true;
      return route.fulfill(envelope({ user }));
    }
    if (url.pathname === "/api/households/current") {
      return route.fulfill(householdCreated ? envelope({ household }) : envelope({ household: null }));
    }
    if (url.pathname === "/api/households" && request.method() === "POST") {
      householdCreated = true;
      return route.fulfill(envelope({ household }, 201));
    }
    if (url.pathname === "/api/account/avatar" && request.method() === "PUT") {
      avatarUploaded = true;
      avatarUrl = "/api/users/user-profile-crop/avatar?v=2";
      return route.fulfill(envelope({ avatarUrl }));
    }
    if (url.pathname === "/api/home/today") {
      return route.fulfill(envelope({ date: "2026-09-01", homeTasks: [], completedRecords: [], passedRecords: [], shopping: { pendingCount: 0 }, members: [{ userId: user.id, displayName: user.displayName, role: "owner", color: "#d9f2eb", avatarUrl }] }));
    }
    if (url.pathname === "/api/users/user-profile-crop/avatar") {
      return route.fulfill({ status: 200, contentType: "image/png", body: readFileSync(portraitFixture) });
    }
    return route.fulfill(failure("NOT_FOUND", 404));
  });
  return {
    get registerCount() { return registerCount; },
    get avatarUploaded() { return avatarUploaded; },
    get householdCreated() { return householdCreated; }
  };
};

const screenshot = async (page: Page, name: string) => {
  await page.screenshot({ path: join(artifactRoot, name), animations: "disabled" });
};

const fillRegistration = async (page: Page) => {
  await page.goto("/register");
  await expect(page.getByRole("heading", { name: "新規登録" })).toBeVisible();
  await page.locator("#register-name").fill("Crop User");
  await page.locator("#register-email").fill(`crop-${Date.now()}@example.test`);
  await page.locator("#register-password").fill("very-long-password");
};

test.describe("profile image registration and crop", () => {
  test.use({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });

  test("registers with a portrait image, crops it, uploads it, and keeps the avatar after reload", async ({ page }) => {
    const state = await setupApi(page);
    await fillRegistration(page);
    await screenshot(page, "01-register-before-image-390x844.png");

    await page.locator("#register-profile-image").setInputFiles(portraitFixture);
    await expect(page.getByRole("dialog", { name: "プロフィール画像を調整" })).toBeVisible();
    await screenshot(page, "02-crop-portrait-390x844.png");
    await page.getByLabel("プロフィール画像の拡大縮小").fill("1.8");
    await screenshot(page, "03-crop-portrait-zoomed-390x844.png");
    await page.getByRole("button", { name: "決定" }).click();
    await expect(page.getByAltText("選択したプロフィール画像のプレビュー")).toBeVisible();
    await screenshot(page, "04-register-crop-confirmed-390x844.png");

    await page.getByRole("button", { name: "新規登録" }).click();
    await expect.poll(() => state.registerCount).toBe(1);
    await expect(page).toHaveURL(/\/household\/create$/);
    await page.locator("#household-name").fill("Crop House");
    await page.getByRole("button", { name: "家庭を作る" }).click();
    await expect.poll(() => state.householdCreated).toBeTruthy();
    await expect.poll(() => state.avatarUploaded).toBeTruthy();
    await expect(page).toHaveURL(/\/home$/);

    await page.goto("/other/account");
    await expect(page.getByRole("button", { name: "プロフィール画像を変更" })).toBeVisible();
    await expect(page.locator(".m5-avatar img")).toBeVisible();
    await screenshot(page, "05-registered-avatar-390x844.png");
    await page.reload();
    await expect(page.locator(".m5-avatar img")).toBeVisible();
    await screenshot(page, "06-registered-avatar-after-reload-390x844.png");
  });

  test("keeps the crop sheet inside a short mobile viewport for a landscape image", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 812 });
    await setupApi(page);
    await fillRegistration(page);
    await page.locator("#register-profile-image").setInputFiles(landscapeFixture);
    const dialog = page.getByRole("dialog", { name: "プロフィール画像を調整" });
    await expect(dialog).toBeVisible();
    await page.waitForTimeout(300);
    await expect(dialog.getByRole("button", { name: "キャンセル" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "決定" })).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThanOrEqual(812);
    await screenshot(page, "07-crop-landscape-short-390x812.png");
    await dialog.getByRole("button", { name: "キャンセル" }).click();
    await expect(page.getByRole("dialog", { name: "プロフィール画像を調整" })).toHaveCount(0);
  });

  test("keeps no-image registration compatible", async ({ page }) => {
    const state = await setupApi(page);
    await fillRegistration(page);
    await page.getByRole("button", { name: "新規登録" }).click();
    await expect(page).toHaveURL(/\/household\/create$/);
    await page.locator("#household-name").fill("No Image House");
    await page.getByRole("button", { name: "家庭を作る" }).click();
    await expect(page).toHaveURL(/\/home$/);
    expect(state.registerCount).toBe(1);
    expect(state.avatarUploaded).toBeFalsy();
  });
});

test.describe("profile image crop at 375px", () => {
  test.use({ viewport: { width: 375, height: 812 }, reducedMotion: "reduce" });

  test("keeps registration controls reachable after crop confirmation", async ({ page }) => {
    await setupApi(page);
    await fillRegistration(page);
    await page.locator("#register-profile-image").setInputFiles(portraitFixture);
    await page.getByRole("button", { name: "決定" }).click();
    await expect(page.getByAltText("選択したプロフィール画像のプレビュー")).toBeVisible();
    await expect(page.getByRole("button", { name: "新規登録" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    await screenshot(page, "08-register-crop-confirmed-375x812.png");
  });
});
