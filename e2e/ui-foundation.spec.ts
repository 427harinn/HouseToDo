import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

test.use({
  viewport: { width: 390, height: 844 },
  video: { mode: "on", size: { width: 390, height: 844 } }
});

const evidenceDir = path.resolve(process.env.PLAYWRIGHT_ARTIFACT_DIR ?? "artifacts/playwright/ui-foundation");

const moveToNeutral = async (page: Page, clickNeutral = true) => {
  await page.mouse.move(10, 100);
  if (clickNeutral) await page.mouse.click(10, 100);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
};

const json = (data: unknown) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({ ok: true, data, requestId: "ui-foundation" })
});

test("M1 shared navigation and Add sheet work at the 390x844 review viewport", async ({ page }) => {
  await mkdir(evidenceDir, { recursive: true });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;
    if (!pathname.startsWith("/api/")) return route.continue();
    if (pathname === "/api/auth/me") {
      return route.fulfill(json({ user: { id: "user-1", email: "e2e@example.test", displayName: "E2E User" } }));
    }
    if (pathname === "/api/households/current") {
      return route.fulfill(json({ household: { id: "household-1", name: "E2E household", timezone: "Asia/Tokyo", weekStartsOn: 1, role: "owner" } }));
    }
    if (pathname === "/api/households/current/members") return route.fulfill(json({ members: [] }));
    if (pathname === "/api/dashboard/today") {
      return route.fulfill(json({
        date: "2026-08-24",
        household: { id: "household-1", name: "E2E household" },
        summary: { total: 0, pending: 0, inProgress: 0, completed: 0, skipped: 0 },
        todayTasks: [],
        weeklyTasks: [],
        shopping: { pendingCount: 0, previewItems: [] },
        members: []
      }));
    }
    if (pathname === "/api/tasks/calendar") {
      return route.fulfill(json({
        from: "2026-08-01",
        to: "2026-09-11",
        today: "2026-08-24",
        timezone: "Asia/Tokyo",
        selectedDate: "2026-08-24",
        dates: {},
        selected: { fixed: [], weeklyFlexible: [], monthlyFlexible: [], shopping: [] }
      }));
    }
    if (pathname === "/api/shopping/items") {
      const pending = Array.from({ length: 12 }, (_, index) => ({
        id: `shopping-${index + 1}`,
        name: `長い買い物 ${index + 1}`,
        quantity: "1個",
        note: null,
        plannedPurchaseDate: null,
        status: "pending",
        addedBy: "user-1",
        purchasedBy: null,
        purchasedAt: null,
        sortOrder: index + 1,
        createdAt: "2026-08-24T00:00:00Z",
        updatedAt: "2026-08-24T00:00:00Z",
        image: null
      }));
      return route.fulfill(json({ pending, purchased: [] }));
    }
    if (pathname === "/api/shopping/recent") return route.fulfill(json({ items: [] }));
    if (pathname === "/api/shopping/templates") return route.fulfill(json({ templates: [] }));
    if (pathname === "/api/tasks/recent") return route.fulfill(json({ tasks: [] }));
    if (pathname === "/api/task-templates") return route.fulfill(json({ templates: [] }));
    if (pathname === "/api/households/current/image-usage") return route.fulfill(json({
      activeCount: 0,
      activeCountLimit: 50,
      activeBytes: 0,
      activeBytesLimit: 50 * 1024 * 1024,
      reservedCount: 0,
      reservedBytes: 0,
      pendingCleanupBytes: 0,
      pendingCleanupUnknownCount: 0,
      storedBytes: 0,
      storedBytesKnown: true,
      storedBytesLimit: 75 * 1024 * 1024,
      dailyUploadDate: "2026-08-24",
      dailyUploadCount: 0,
      dailyUploadLimit: 20
    }));
    return route.fulfill(json({}));
  });
  await page.goto("/home");
  await page.addStyleTag({
    content:
      ".bottom-nav__button:hover, .bottom-nav__button:focus-visible { background: transparent !important; outline: none !important; }"
  });
  await expect(page.getByRole("heading", { name: "やること" })).toBeVisible();
  await expect(page.getByRole("button", { name: "ホーム" })).toHaveAttribute("aria-current", "page");
  await moveToNeutral(page, false);
  await page.screenshot({ path: path.join(evidenceDir, "home-390x844.png"), fullPage: true });

  await page.getByRole("button", { name: "カレンダー" }).click();
  await expect(page).toHaveURL(/\/calendar$/);
  await expect(page.getByRole("heading", { name: "カレンダー" })).toBeVisible();
  await moveToNeutral(page);
  await page.screenshot({ path: path.join(evidenceDir, "calendar-390x844.png"), fullPage: true });

  await page.getByRole("button", { name: "買い物" }).click();
  await expect(page).toHaveURL(/\/shopping$/);
  await expect(page.getByRole("heading", { name: "買い物リスト" })).toBeVisible();
  await moveToNeutral(page);
  await page.screenshot({ path: path.join(evidenceDir, "shopping-390x844.png"), fullPage: true });

  expect(await page.locator(".bottom-nav").evaluate((element) => getComputedStyle(element).position)).toBe("static");
  const lastShoppingItem = page.getByText("長い買い物 12", { exact: true });
  await lastShoppingItem.scrollIntoViewIfNeeded();
  await expect(lastShoppingItem).toBeVisible();
  const lastShoppingButton = page.getByRole("button", { name: "長い買い物 12を購入済みにする" });
  const lastShoppingBox = await lastShoppingButton.boundingBox();
  const navBox = await page.locator(".bottom-nav").boundingBox();
  expect(lastShoppingBox).not.toBeNull();
  expect(navBox).not.toBeNull();
  expect(lastShoppingBox!.y + lastShoppingBox!.height).toBeLessThanOrEqual(navBox!.y);
  await lastShoppingButton.click();

  await page.getByRole("button", { name: "ホーム" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await page.getByRole("button", { name: "追加" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "買い物" }).click();
  await expect(page).toHaveURL(/\/shopping\/new$/);
  await page.getByRole("button", { name: "ホーム" }).click();
  await expect(page).toHaveURL(/\/home$/);

  await page.getByRole("button", { name: "その他" }).click();
  await expect(page).toHaveURL(/\/other$/);
  await expect(page.getByRole("button", { name: "その他" })).toHaveAttribute("aria-current", "page");
  await moveToNeutral(page);
  await page.screenshot({ path: path.join(evidenceDir, "members-other-current-390x844.png"), fullPage: true });

  await page.getByRole("button", { name: "追加" }).click();
  await expect(page.getByRole("dialog", { name: "追加" })).toBeVisible();
  await page.waitForTimeout(300);
  await moveToNeutral(page, false);
  await page.screenshot({ path: path.join(evidenceDir, "add-sheet-open-390x844.png"), fullPage: true });

  await page.waitForTimeout(700);
  const handle = page.locator(".bottom-sheet__handle");
  const handleBox = await handle.boundingBox();
  expect(handleBox).not.toBeNull();
  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + 130, { steps: 8 });
  await page.waitForTimeout(700);
  await page.mouse.up();
  await expect(page.getByRole("dialog", { name: "追加" })).toBeHidden();
  await page.waitForTimeout(700);

  await page.getByRole("button", { name: "追加" }).click();
  await page.getByRole("button", { name: "家事" }).click();
  await expect(page).toHaveURL(/\/tasks\/new$/);
});
