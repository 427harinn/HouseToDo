import { expect, test, type Browser, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const password = "very-long-password";
const artifactRoot = process.env.PLAYWRIGHT_ARTIFACT_DIR ?? "artifacts/playwright/shopping-image";
const artifactDir = artifactRoot.endsWith("/all-e2e") || artifactRoot.endsWith("\\all-e2e")
  ? path.join(artifactRoot, "shopping-image")
  : artifactRoot;
const fixture = (name: string) => path.resolve("e2e/fixtures", name);
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

type User = { email: string; name: string };

const originHeader = (page: Page) => ({ origin: new URL(page.url()).origin });

const register = async (page: Page, user: User) => {
  await page.goto("/register");
  await page.locator("#register-name").fill(user.name);
  await page.locator("#register-email").fill(user.email);
  await page.locator("#register-password").fill(password);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/household\/create|\/home/);
};

const createHousehold = async (page: Page, name: string) => {
  await page.goto("/household/create");
  await page.locator("#household-name").fill(name);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/home/);
};

const inviteCode = async (page: Page) => {
  const response = await page.request.post("/api/households/current/invites", { headers: originHeader(page), data: {} });
  expect(response.status()).toBe(201);
  return (await response.json()).data.invite.code as string;
};

const joinHousehold = async (page: Page, code: string) => {
  await page.goto("/household/join");
  await page.locator("#invite-code").fill(code);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/home/);
};

const createItemApi = async (page: Page, name: string) => {
  const response = await page.request.post("/api/shopping/items", { headers: originHeader(page), data: { name } });
  expect(response.status()).toBe(201);
  return (await response.json()).data.item.id as string;
};

const uploadFixtureApi = async (page: Page, itemId: string, fileName: string, mimeType: string, width: number, height: number) => {
  const response = await page.request.put(`/api/shopping/items/${itemId}/image`, {
    headers: originHeader(page),
    multipart: {
      image: { name: fileName, mimeType, buffer: await (await import("node:fs/promises")).readFile(fixture(fileName)) },
      width: String(width),
      height: String(height)
    }
  });
  expect(response.status()).toBe(200);
};

const imageUrl = async (page: Page, itemId: string) => {
  const response = await page.request.get(`/api/shopping/items/${itemId}`);
  expect(response.status()).toBe(200);
  return (await response.json()).data.item.image as { updatedAt: string };
};

const shot = async (page: Page, name: string) => {
  await mkdir(artifactDir, { recursive: true });
  await page.screenshot({ path: path.resolve(artifactDir, name), fullPage: true });
};

const waitForApp = async (page: Page) => {
  await expect(async () => {
    const response = await page.request.get("/api/health");
    expect(response.ok()).toBeTruthy();
  }).toPass({ timeout: 60_000 });
};

test.describe("shopping item image E2E", () => {
  test("creates, serves, edits, replaces, shares, deletes, and cleans up private images", async ({ browser }: { browser: Browser }) => {
    const id = stamp();
    const userA = { email: `image-a-${id}@example.test`, name: `Image A ${id}` };
    const userB = { email: `image-b-${id}@example.test`, name: `Image B ${id}` };
    const contextA = await browser.newContext({ locale: "ja-JP", timezoneId: "Asia/Tokyo" });
    const contextB = await browser.newContext({ locale: "ja-JP", timezoneId: "Asia/Tokyo" });
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    await waitForApp(pageA);
    await register(pageA, userA);
    await createHousehold(pageA, `Image House ${id}`);
    const code = await inviteCode(pageA);
    await register(pageB, userB);
    await joinHousehold(pageB, code);

    await pageA.goto("/shopping/new");
    await pageA.locator("#shopping-image").setInputFiles(fixture("shopping-item-landscape.jpg"));
    await expect(pageA.locator(".shopping-image-preview")).toHaveCount(1);
    await shot(pageA, "02-shopping-image-preview.png");
    await pageA.locator("#shopping-name").fill(`Image Milk ${id}`);
    await pageA.locator("#shopping-quantity").fill("1本");
    await pageA.locator("#shopping-note").fill("landscape fixture");
    await shot(pageA, "01-shopping-image-create.png");
    await pageA.locator('form button[type="submit"]').click();
    await expect(pageA).toHaveURL(/\/shopping\?item=[^&]+$/);

    const itemId = new URL(pageA.url()).searchParams.get("item")!;
    await pageA.goto("/shopping");
    const itemRow = pageA.locator(`[data-shopping-m4-id="${itemId}"]`);
    await itemRow.getByRole("button", { name: new RegExp(`Image Milk ${id}`) }).click();
    const cardImage = itemRow.locator(".shopping-m4__expanded img");
    await expect(cardImage).toBeVisible();
    const firstUrl = await cardImage.getAttribute("src");
    expect(firstUrl).toMatch(/^\/api\/shopping\/items\/[^/]+\/image\?v=/);
    expect(firstUrl).not.toContain("r2");
    await shot(pageA, "03-shopping-image-card.png");

    const imageResponse = await pageA.request.get(new URL(firstUrl!, pageA.url()).href);
    expect(imageResponse.status()).toBe(200);
    expect(imageResponse.headers()["content-type"]).toContain("image/webp");
    expect(imageResponse.headers()["cache-control"]).toContain("private");
    expect(imageResponse.headers().etag).toBeTruthy();

    await pageA.goto(`/shopping/items/${itemId}/edit`);
    await expect(pageA.locator(".shopping-image-preview")).toHaveCount(1);
    await shot(pageA, "04-shopping-image-edit.png");
    await pageA.locator("#shopping-note").fill("preserved by edit");
    await pageA.locator('form button[type="submit"]').click();
    await expect(pageA).toHaveURL(new RegExp(`/shopping\\?item=${itemId}`));

    await pageA.goto(`/shopping/items/${itemId}/edit`);
    await pageA.locator("#shopping-image").setInputFiles(fixture("shopping-item-portrait.png"));
    await expect(pageA.locator(".shopping-image-preview")).toHaveCount(1);
    await expect(pageA.locator(".shopping-image-preview")).toHaveAttribute("alt", /Image Milk/);
    await pageA.locator("#shopping-note").fill("portrait PNG fixture");
    await pageA.locator('form button[type="submit"]').click();
    await expect(pageA).toHaveURL(new RegExp(`/shopping\\?item=${itemId}`));
    await pageA.goto("/shopping");
    await expect(pageA.locator(`[data-shopping-m4-id="${itemId}"]`)).toBeVisible();

    await pageA.goto(`/shopping/items/${itemId}/edit`);
    await pageA.locator("#shopping-image").setInputFiles(fixture("shopping-item-replacement.webp"));
    await expect(pageA.locator(".shopping-image-preview")).toHaveCount(1);
    await shot(pageA, "05-shopping-image-replaced.png");
    await pageA.locator('form button[type="submit"]').click();
    await expect(pageA).toHaveURL(new RegExp(`/shopping\\?item=${itemId}`));
    await pageA.goto("/shopping");
    const replacedRow = pageA.locator(`[data-shopping-m4-id="${itemId}"]`);
    await replacedRow.getByRole("button", { name: new RegExp(`Image Milk ${id}`) }).click();
    const replacedUrl = await replacedRow.locator(".shopping-m4__expanded img").getAttribute("src");
    expect(replacedUrl).toBeTruthy();
    expect(replacedUrl).not.toBe(firstUrl);

    await pageB.goto("/shopping");
    await expect(pageB.locator(`[data-shopping-m4-id="${itemId}"]`)).toBeVisible();
    const pendingRowB = pageB.locator(`[data-shopping-m4-id="${itemId}"]`);
    await pendingRowB.getByRole("button", { name: new RegExp(`Image Milk ${id}`) }).click();
    await pendingRowB.getByRole("button", { name: "購入" }).click();
    await pageB.getByRole("button", { name: /購入済み 1件/ }).click();
    const purchasedRowB = pageB.locator(`[data-shopping-m4-id="${itemId}"]`);
    await purchasedRowB.getByRole("button", { name: new RegExp(`Image Milk ${id}`) }).click();
    await expect(purchasedRowB.locator(".shopping-m4__expanded img")).toBeVisible();
    await shot(pageB, "06-shopping-image-purchased.png");
    await pageA.goto("/shopping");
    await pageA.getByRole("button", { name: /購入済み 1件/ }).click();
    const purchasedRowA = pageA.locator(`[data-shopping-m4-id="${itemId}"]`);
    await expect(purchasedRowA).toBeVisible();
    await purchasedRowA.getByRole("button", { name: new RegExp(`Image Milk ${id}`) }).click();
    await expect(purchasedRowA.getByRole("img", { name: `購入者: ${userB.name}` })).toBeVisible();
    await expect(purchasedRowA.locator(".shopping-m4__expanded img")).toBeVisible();
    await shot(pageA, "07-shopping-image-two-users.png");

    await pageA.goto(`/shopping/items/${itemId}/edit`);
    pageA.once("dialog", (dialog) => dialog.accept());
    await pageA.getByRole("button", { name: "外す" }).click();
    await expect(pageA.getByRole("button", { name: "外す" })).toHaveCount(0);
    await expect(pageA.locator("#shopping-name")).toHaveValue(`Image Milk ${id}`);
    await pageA.locator('form button[type="submit"]').click();
    await pageA.goto("/shopping");
    await pageA.getByRole("button", { name: /購入済み 1件/ }).click();
    await expect(pageA.locator(`[data-shopping-m4-id="${itemId}"]`)).toBeVisible();
    const deletedImage = await pageA.request.get(new URL(replacedUrl!, pageA.url()).href);
    expect(deletedImage.status()).toBe(404);

    const purchasedId = await createItemApi(pageA, `Cleanup purchased ${id}`);
    await uploadFixtureApi(pageA, purchasedId, "shopping-item-replacement.webp", "image/webp", 640, 400);
    await pageA.request.post(`/api/shopping/items/${purchasedId}/purchase`, { headers: originHeader(pageA), data: {} });
    const pendingId = await createItemApi(pageA, `Cleanup pending ${id}`);
    await uploadFixtureApi(pageA, pendingId, "shopping-item-replacement.webp", "image/webp", 640, 400);
    const purchasedImage = await imageUrl(pageA, purchasedId);
    const pendingImage = await imageUrl(pageA, pendingId);
    await pageA.request.post("/api/shopping/items/clear-purchased", { headers: originHeader(pageA), data: {} });
    expect((await pageA.request.get(`/api/shopping/items/${purchasedId}/image?v=${purchasedImage.updatedAt}`)).status()).toBe(404);
    expect((await pageA.request.get(`/api/shopping/items/${pendingId}/image?v=${pendingImage.updatedAt}`)).status()).toBe(200);

    const deletedItemId = await createItemApi(pageA, `Cleanup item ${id}`);
    await uploadFixtureApi(pageA, deletedItemId, "shopping-item-replacement.webp", "image/webp", 640, 400);
    const deletedItemImage = await imageUrl(pageA, deletedItemId);
    await pageA.request.delete(`/api/shopping/items/${deletedItemId}`, { headers: originHeader(pageA), data: {} });
    expect((await pageA.request.get(`/api/shopping/items/${deletedItemId}/image?v=${deletedItemImage.updatedAt}`)).status()).toBe(404);

    for (const [name, size] of [
      ["08-shopping-image-mobile-320.png", { width: 320, height: 568 }],
      ["09-shopping-image-mobile-390.png", { width: 390, height: 844 }],
      ["10-shopping-image-mobile-430.png", { width: 430, height: 932 }],
      ["11-shopping-image-desktop.png", { width: 1280, height: 800 }]
    ] as const) {
      await pageA.setViewportSize(size);
      await pageA.goto("/shopping");
      await expect(pageA).toHaveURL(/\/shopping/);
      await expect(pageA.locator(`[data-shopping-m4-id="${pendingId}"]`)).toBeVisible();
      await expect.poll(() => pageA.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
      await shot(pageA, name);
    }

    const contextC = await browser.newContext({ locale: "ja-JP", timezoneId: "Asia/Tokyo" });
    const pageC = await contextC.newPage();
    await register(pageC, { email: `image-c-${id}@example.test`, name: `Image C ${id}` });
    await createHousehold(pageC, `Other Image House ${id}`);
    expect((await pageC.request.get(`/api/shopping/items/${pendingId}/image`)).status()).toBe(404);

    await contextC.close();
    await contextA.close();
    await contextB.close();
  });
});
