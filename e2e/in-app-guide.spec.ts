import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

test.use({ viewport: { width: 390, height: 844 } });

const evidenceDir = path.resolve(process.env.PLAYWRIGHT_ARTIFACT_DIR ?? "artifacts/playwright/in-app-guide");
const envelope = (data: unknown) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({ ok: true, data, requestId: "guide-e2e" })
});

test("opens the eight-page guide, follows scroll snap, and closes back to Other", async ({ page }) => {
  await mkdir(evidenceDir, { recursive: true });
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (!pathname.startsWith("/api/")) return route.continue();
    if (pathname === "/api/auth/me") return route.fulfill(envelope({ user: { id: "user-1", email: "guide@example.test", displayName: "ガイド利用者" } }));
    if (pathname === "/api/households/current") return route.fulfill(envelope({ household: { id: "household-1", name: "わが家", timezone: "Asia/Tokyo", weekStartsOn: 1, role: "owner" } }));
    return route.fulfill(envelope({}));
  });

  await page.goto("/other");
  await page.getByRole("link", { name: "使い方" }).click();
  await expect(page).toHaveURL(/\/other\/guide$/);
  await expect(page.getByRole("main", { name: "使い方ガイド" })).toBeVisible();
  await expect(page.locator(".guide-page__slide")).toHaveCount(8);
  await expect(page.locator(".guide-page__slide img")).toHaveCount(8);
  await expect(page.locator(".guide-page__dot")).toHaveCount(8);
  await expect(page.locator(".guide-page__dot").nth(0)).toHaveClass(/is-active/);
  await expect(page.locator(".guide-page__indicator")).toHaveCSS("top", "16px");
  await expect.poll(async () => page.locator(".guide-page__slide img").evaluateAll((images) => (
    images as HTMLImageElement[]
  ).every((image) => image.complete && image.naturalWidth > 0))).toBe(true);
  await expect(page.getByRole("navigation", { name: "主要画面" })).toHaveCount(0);
  await page.screenshot({ path: path.join(evidenceDir, "guide-page-1.png") });

  const scroller = page.locator(".guide-page__scroller");
  const moveToPage = async (pageNumber: number) => {
    await scroller.evaluate((element, index) => {
      element.scrollTo({ left: element.clientWidth * index, behavior: "auto" });
    }, pageNumber - 1);
    await page.waitForTimeout(180);
    await expect(page.locator(".guide-page__dot").nth(pageNumber - 1)).toHaveClass(/is-active/);
  };

  await moveToPage(2);
  await moveToPage(4);
  await page.screenshot({ path: path.join(evidenceDir, "guide-page-4.png") });
  await moveToPage(8);
  await page.screenshot({ path: path.join(evidenceDir, "guide-page-8.png") });
  await expect(page.getByText("現在のページ: 8")).toBeAttached();

  await page.getByRole("button", { name: "使い方を閉じる" }).click();
  await expect(page).toHaveURL(/\/other$/);
  await expect(page.getByRole("heading", { name: "その他" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "主要画面" })).toBeVisible();

  await page.goto("/other/guide");
  await expect(page.locator(".guide-page__dot").nth(0)).toHaveClass(/is-active/);
});
