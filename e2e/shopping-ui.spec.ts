import { expect, test, type Browser, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const artifactDir = process.env.PLAYWRIGHT_ARTIFACT_DIR ?? "artifacts/playwright/shopping-ui";
const password = "very-long-password";

type TestUser = {
  email: string;
  name: string;
};

const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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

const expectNoHorizontalScroll = async (page: Page) => {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1))
    .toBe(true);
};

const expectShoppingListLoaded = async (page: Page) => {
  await expect(page.getByRole("status").filter({ hasText: "買い物リストを読み込んでいます。" })).toHaveCount(0);
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

const originHeader = (page: Page) => ({ origin: new URL(page.url()).origin });

const issueInvite = async (page: Page) => {
  const response = await page.request.post("/api/households/current/invites", {
    headers: originHeader(page),
    data: {}
  });
  expect(response.status()).toBe(201);
  const payload = await response.json();
  return payload.data.invite.code as string;
};

test.describe("shopping UI E2E", () => {
  test("covers list, item forms, purchase state, templates, dashboard, responsive sizes, and two users", async ({ browser }: { browser: Browser }) => {
    const id = stamp();
    const userA = { email: `shop-a-${id}@example.test`, name: `Buyer A ${id}` };
    const userB = { email: `shop-b-${id}@example.test`, name: `Buyer B ${id}` };
    const contextA = await browser.newContext({ locale: "ja-JP", timezoneId: "Asia/Tokyo" });
    const contextB = await browser.newContext({ locale: "ja-JP", timezoneId: "Asia/Tokyo" });
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    await waitForApp(pageA);
    await registerViaUi(pageA, userA);
    await createHouseholdViaUi(pageA, `Shopping House ${id}`);
    const inviteCode = await issueInvite(pageA);
    await registerViaUi(pageB, userB);
    await joinHouseholdViaUi(pageB, inviteCode);

    await pageA.goto("/shopping");
    await expect(pageA.getByRole("heading", { name: "買い物リスト" })).toBeVisible();
    await shot(pageA, "01-shopping-empty.png");

    await pageA.getByRole("button", { name: "商品を追加" }).click();
    await expect(pageA).toHaveURL(/\/shopping\/new/);
    await shot(pageA, "04-shopping-create.png");
    await pageA.locator("#shopping-name").fill(`牛乳 ${id}`);
    await pageA.locator("#shopping-quantity").fill("1本");
    await pageA.locator("#shopping-note").fill("低脂肪ではないもの");
    await pageA.locator('form button[type="submit"]').click();
    await expect(pageA.getByRole("heading", { name: `牛乳 ${id}` })).toBeVisible();

    await pageA.goto("/shopping");
    await expect(pageA.getByText(`牛乳 ${id}`)).toBeVisible();
    await expect(pageA.getByText("1本 / 低脂肪ではないもの")).toBeVisible();
    await shot(pageA, "02-shopping-pending.png");

    await pageA.getByRole("button", { name: `牛乳 ${id}を編集` }).click();
    await shot(pageA, "05-shopping-edit.png");
    await expect(pageA.locator("#shopping-quantity")).toHaveValue("1本");
    await expect(pageA.locator("#shopping-note")).toHaveValue("低脂肪ではないもの");
    await pageA.locator("#shopping-quantity").fill("2本");
    await pageA.locator("#shopping-note").fill("週末用");
    await pageA.locator('form button[type="submit"]').click();
    await expect(pageA.getByText("2本")).toBeVisible();

    await pageB.goto("/shopping");
    await pageB.getByRole("button", { name: `牛乳 ${id}を購入済みにする` }).click();
    await expect(pageB.getByText(/Buyer B/)).toBeVisible();
    await shot(pageB, "10-two-user-purchase.png");

    await pageA.goto("/shopping");
    await pageA.getByRole("button", { name: "更新" }).click();
    await expect(pageA.getByText(/Buyer B/)).toBeVisible();
    await pageA.getByRole("button", { name: `牛乳 ${id}を未購入へ戻す` }).click();
    await expect(pageA.getByRole("button", { name: `牛乳 ${id}を購入済みにする` })).toBeVisible();

    await pageA.goto("/shopping/templates");
    await shot(pageA, "06-shopping-templates.png");
    await pageA.getByRole("button", { name: "登録" }).click();
    await shot(pageA, "07-template-create.png");
    await pageA.locator("#template-name").fill(`卵 ${id}`);
    await pageA.locator("#template-quantity").fill("1パック");
    await pageA.locator("#template-note").fill("いつもの");
    await pageA.locator('form button[type="submit"]').click();
    await expect(pageA.getByText(`卵 ${id}`)).toBeVisible();

    await pageB.goto("/shopping");
    await pageB.getByRole("button", { name: `${`卵 ${id}`}を買い物リストへ追加` }).click();
    await expect(pageB.getByText(`卵 ${id}`)).toBeVisible();
    await shot(pageB, "08-template-added-item.png");

    await pageA.goto("/shopping/templates");
    await pageA.getByRole("button", { name: "編集" }).first().click();
    await pageA.locator("#template-note").fill("編集後メモ");
    await pageA.locator('form button[type="submit"]').click();
    await pageB.goto("/shopping");
    await expect(pageB.getByText("1パック / いつもの")).toBeVisible();

    await pageA.goto("/shopping/templates");
    pageA.once("dialog", (dialog) => dialog.accept());
    await pageA.getByRole("button", { name: "削除" }).first().click();
    await expect(pageA.getByText(`卵 ${id}`)).not.toBeVisible();

    await pageA.goto("/shopping");
    await expectShoppingListLoaded(pageA);
    await expect(pageA.getByRole("button", { name: `牛乳 ${id}を購入済みにする` })).toBeVisible();
    await pageA.getByRole("button", { name: `牛乳 ${id}を購入済みにする` }).click();
    await shot(pageA, "03-shopping-purchased.png");
    pageA.once("dialog", (dialog) => dialog.accept());
    await pageA.getByRole("button", { name: "購入済みを整理" }).click();
    await expect(pageA.getByText(`卵 ${id}`)).toBeVisible();
    await expect(pageA.getByText(`牛乳 ${id}`)).not.toBeVisible();

    await pageA.goto("/home");
    await expect(pageA.getByText(`卵 ${id}`).first()).toBeVisible();
    await shot(pageA, "09-dashboard-shopping-preview.png");

    for (const [name, size] of [
      ["11-mobile-320.png", { width: 320, height: 568 }],
      ["12-mobile-390.png", { width: 390, height: 844 }],
      ["13-mobile-430.png", { width: 430, height: 932 }],
      ["14-desktop.png", { width: 1280, height: 800 }]
    ] as const) {
      await pageA.setViewportSize(size);
      await pageA.goto("/shopping");
      await expect(pageA.getByRole("heading", { name: "買い物リスト" })).toBeVisible();
      await expectShoppingListLoaded(pageA);
      await expect(pageA.getByText(`卵 ${id}`)).toBeVisible();
      await expectNoHorizontalScroll(pageA);
      await shot(pageA, name);
    }

    await pageA.goto("/settings/members");
    await pageA.getByRole("button", { name: /ログアウト|繝ｭ繧ｰ繧｢繧ｦ繝・/ }).click();
    await expect(pageA).toHaveURL(/\/login/);
    await pageA.goto("/shopping");
    await expect(pageA).toHaveURL(/\/login/);

    await contextA.close();
    await contextB.close();
  });
});
