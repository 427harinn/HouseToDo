import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { mkdir } from "node:fs/promises";

const artifactRoot = process.env.PLAYWRIGHT_ARTIFACT_DIR ?? "artifacts/playwright/shopping-purchased-swipe";

const ok = (data: unknown) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({ ok: true, data, requestId: "e2e-shopping-purchased-swipe" })
});

const swipe = async (page: Page, row: ReturnType<Page["locator"]>, from: number, to: number) => {
  const box = await row.boundingBox();
  if (!box) throw new Error("Shopping row is not measurable.");
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * from, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * to, y, { steps: 8 });
  await page.mouse.up();
};

test("purchased Shopping restore is swipe-only and exclusive across sections", async ({ page }) => {
  const pending = {
    id: "pending-1",
    name: "牛乳",
    quantity: "1本",
    note: null,
    plannedPurchaseDate: null,
    status: "pending",
    addedBy: "user-1",
    purchasedBy: null,
    purchasedAt: null,
    sortOrder: 1,
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-01T00:00:00Z",
    image: null
  };
  const purchased = {
    ...pending,
    id: "purchased-1",
    name: "卵",
    status: "purchased",
    purchasedBy: { userId: "user-1", displayName: "はる" },
    purchasedAt: "2026-08-24T01:32:00Z"
  };
  let purchasedVisible = true;
  await page.route((url) => new URL(url).pathname.startsWith("/api/"), async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (url.pathname === "/api/auth/me") return route.fulfill(ok({ user: { id: "user-1", email: "e2e@example.test", displayName: "はる" } }));
    if (url.pathname === "/api/households/current") return route.fulfill(ok({ household: { id: "house-1", name: "E2E House", timezone: "Asia/Tokyo", weekStartsOn: 0, role: "owner" } }));
    if (url.pathname === "/api/households/current/members") return route.fulfill(ok({ members: [] }));
    if (url.pathname === "/api/shopping/templates") return route.fulfill(ok({ templates: [] }));
    if (url.pathname === "/api/shopping/items" && method === "GET") return route.fulfill(ok({ pending: [pending], purchased: purchasedVisible ? [purchased] : [] }));
    if (url.pathname === "/api/shopping/items/purchased-1/unpurchase" && method === "POST") {
      purchasedVisible = false;
      return route.fulfill(ok({ item: { ...purchased, status: "pending", purchasedBy: null, purchasedAt: null } }));
    }
    return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ ok: false, error: { code: "NOT_FOUND", message: "not found" }, requestId: "e2e-shopping-purchased-swipe" }) });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/shopping");
  await expect(page.getByRole("heading", { name: "買い物" })).toBeVisible();
  await page.getByRole("button", { name: "購入済み 1件" }).click();

  const purchasedRow = page.locator('[data-shopping-m4-id="purchased-1"]');
  const pendingRow = page.locator('[data-shopping-m4-id="pending-1"]');
  const heightBeforeTap = (await purchasedRow.boundingBox())?.height;
  await purchasedRow.locator(".shopping-m4__row-main").click();
  await expect(purchasedRow.locator(".shopping-m4__row-main")).toHaveAttribute("aria-expanded", "false");
  await expect(purchasedRow.locator(".shopping-m4__expanded")).toHaveCount(0);
  const heightAfterTap = (await purchasedRow.boundingBox())?.height;
  expect(heightAfterTap).toBeCloseTo(heightBeforeTap ?? 0, 3);
  await expect(purchasedRow.getByRole("button", { name: "戻す", exact: true })).toHaveCount(0);

  await swipe(page, purchasedRow, 0.8, 0.35);
  await expect(purchasedRow.getByRole("button", { name: "戻す", exact: true })).toBeVisible();
  await mkdir(artifactRoot, { recursive: true });
  await page.screenshot({ path: path.resolve(artifactRoot, "purchased-swipe-restore-visible.png"), fullPage: true });
  await swipe(page, purchasedRow, 0.35, 0.8);
  await expect(purchasedRow.getByRole("button", { name: "戻す", exact: true })).toHaveCount(0);

  await swipe(page, purchasedRow, 0.8, 0.35);
  await swipe(page, pendingRow, 0.8, 0.35);
  await expect(purchasedRow.getByRole("button", { name: "戻す", exact: true })).toHaveCount(0);
  await expect(pendingRow.getByRole("button", { name: "編集", exact: true })).toBeVisible();

  await swipe(page, purchasedRow, 0.8, 0.35);
  await purchasedRow.getByRole("button", { name: "戻す", exact: true }).click();
  await expect(page.getByRole("button", { name: "購入済み 0件" })).toBeVisible();
  await expect(page.locator('[data-shopping-m4-id="purchased-1"]')).toHaveCount(0);
});
