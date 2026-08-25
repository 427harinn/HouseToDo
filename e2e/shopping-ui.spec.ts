import { expect, test, type Browser, type Page } from "@playwright/test";

const password = "very-long-password";
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
type TestUser = { email: string; name: string };

const waitForApp = async (page: Page) => {
  await expect(async () => expect((await page.request.get("/api/health")).ok()).toBeTruthy()).toPass({ timeout: 60_000 });
};
const registerViaUi = async (page: Page, user: TestUser) => {
  await page.goto("/register");
  await page.locator("#register-name").fill(user.name);
  await page.locator("#register-email").fill(user.email);
  await page.locator("#register-password").fill(password);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/onboarding|\/home/);
};
const createHouseholdViaUi = async (page: Page, householdName: string) => {
  await page.goto("/household/create");
  await page.locator("#household-name").fill(householdName);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/home/);
};
const joinHouseholdViaUi = async (page: Page, inviteCode: string) => {
  await page.goto("/household/join");
  await page.locator("#invite-code").fill(inviteCode);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/home/);
};
const issueInvite = async (page: Page) => {
  const response = await page.request.post("/api/households/current/invites", { headers: { origin: new URL(page.url()).origin }, data: {} });
  expect(response.status()).toBe(201);
  return (await response.json()).data.invite.code as string;
};
const openAdd = async (page: Page) => {
  await page.getByRole("button", { name: "追加" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "買い物" }).click();
  await expect(page).toHaveURL(/\/shopping\/new/);
};
const createItem = async (page: Page, name: string, quantity = "", note = "") => {
  await openAdd(page);
  await page.locator("#shopping-name").fill(name);
  if (quantity) await page.locator("#shopping-quantity").fill(quantity);
  if (note) await page.locator("#shopping-note").fill(note);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/shopping\?item=/);
  await page.goto("/shopping");
  await expect(page.getByText(name, { exact: true })).toBeVisible();
};
const pointerSwipeLeft = async (page: Page, row: ReturnType<Page["locator"]>) => {
  const box = await row.boundingBox();
  if (!box) throw new Error("Shopping row has no bounding box");
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.35, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
};

test.describe("shopping UI M4", () => {
  test("covers canonical list, expand/purchase/restore, Add/Edit, swipe, reorder, and household sync", async ({ browser }: { browser: Browser }) => {
    const id = stamp();
    const userA = { email: `shop-a-${id}@example.test`, name: `Buyer A ${id}` };
    const userB = { email: `shop-b-${id}@example.test`, name: `Buyer B ${id}` };
    const contextA = await browser.newContext({ locale: "ja-JP", timezoneId: "Asia/Tokyo", viewport: { width: 390, height: 844 } });
    const contextB = await browser.newContext({ locale: "ja-JP", timezoneId: "Asia/Tokyo", viewport: { width: 390, height: 844 } });
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    await waitForApp(pageA);
    await registerViaUi(pageA, userA);
    await createHouseholdViaUi(pageA, `Shopping House ${id}`);
    const inviteCode = await issueInvite(pageA);
    await registerViaUi(pageB, userB);
    await joinHouseholdViaUi(pageB, inviteCode);

    await pageA.goto("/shopping");
    await expect(pageA.getByRole("heading", { name: "買い物" })).toBeVisible();
    await expect(pageA.getByText("買うものはありません")).toBeVisible();

    await createItem(pageA, `牛乳 ${id}`, "1本", "低脂肪ではないもの");
    await createItem(pageA, `卵 ${id}`);
    await pageA.goto("/shopping");
    const milkRow = pageA.locator("[data-shopping-m4-id]").filter({ hasText: `牛乳 ${id}` });
    await milkRow.getByRole("button", { name: /牛乳/ }).click();
    await expect(milkRow.getByRole("button", { name: "購入" })).toBeVisible();
    await expect(milkRow.getByText("低脂肪ではないもの")).toBeVisible();
    await milkRow.getByRole("button", { name: "購入" }).click();
    await pageA.getByRole("button", { name: /購入済み 1件/ }).click();
    const purchasedRow = pageA.locator("[data-shopping-m4-id]").filter({ hasText: `牛乳 ${id}` });
    await purchasedRow.getByRole("button", { name: /牛乳/ }).click();
    await expect(purchasedRow.getByRole("button", { name: "戻す" })).toBeVisible();
    await expect(purchasedRow.locator(`[aria-label="購入者: ${userA.name}"]`)).toBeVisible();
    await purchasedRow.getByRole("button", { name: "戻す" }).click();
    await expect(pageA.getByRole("button", { name: /購入済み 0件/ })).toBeVisible();

    await pageA.goto("/shopping");
    const eggRow = pageA.locator("[data-shopping-m4-id]").filter({ hasText: `卵 ${id}` });
    await pointerSwipeLeft(pageA, eggRow);
    await expect(eggRow.getByRole("button", { name: "編集" })).toBeVisible();
    await expect(eggRow.getByRole("button", { name: "削除" })).toHaveCount(0);
    await eggRow.getByRole("button", { name: "編集" }).click();
    await expect(pageA).toHaveURL(/\/shopping\/items\/.*\/edit/);
    await pageA.locator("#shopping-quantity").fill("1パック");
    await pageA.locator('form button[type="submit"]').click();
    await expect(pageA).toHaveURL(/\/shopping\?item=/);

    await createItem(pageA, `パン ${id}`, "2個");
    await pageA.goto("/shopping");
    const rows = pageA.locator("[data-shopping-m4-id]");
    const first = rows.filter({ hasText: `卵 ${id}` });
    const second = rows.filter({ hasText: `パン ${id}` });
    const firstBox = await first.boundingBox();
    const secondBox = await second.boundingBox();
    if (!firstBox || !secondBox) throw new Error("Reorder rows have no bounding boxes");
    await pageA.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2);
    await pageA.mouse.down();
    await pageA.waitForTimeout(420);
    await pageA.mouse.move(secondBox.x + secondBox.width / 2, secondBox.y + secondBox.height + 12, { steps: 10 });
    await pageA.mouse.up();
    await expect(rows.first()).toContainText(`パン ${id}`);
    await pageA.reload();
    await expect(rows.first()).toContainText(`パン ${id}`);
    await pageB.goto("/shopping");
    await expect(pageB.locator("[data-shopping-m4-id]").first()).toContainText(`パン ${id}`);
    await contextA.close();
    await contextB.close();
  });
});
