import { expect, test, type Browser, type Page } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

const password = "very-long-password";
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const originHeader = (page: Page) => ({ origin: new URL(page.url()).origin });

const waitForApp = async (page: Page) => {
  await expect(async () => expect((await page.request.get("/api/health")).ok()).toBeTruthy()).toPass({ timeout: 60_000 });
};

const register = async (page: Page, email: string, name: string) => {
  await page.goto("/register");
  await page.locator("#register-name").fill(name);
  await page.locator("#register-email").fill(email);
  await page.locator("#register-password").fill(password);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/household\/create|\/home/);
};

const issueInvite = async (page: Page) => {
  const response = await page.request.post("/api/households/current/invites", { headers: originHeader(page), data: {} });
  expect(response.status()).toBe(201);
  return (await response.json()).data.invite.code as string;
};

const createHousehold = async (page: Page, name: string) => {
  await page.goto("/household/create");
  await page.locator("#household-name").fill(name);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/home/);
};

const joinHousehold = async (page: Page, code: string) => {
  await page.goto("/household/join");
  await page.locator("#invite-code").fill(code);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/home/);
};

const members = async (page: Page) => {
  const response = await page.request.get("/api/households/current/members");
  expect(response.ok()).toBeTruthy();
  return (await response.json()).data.members as Array<{ userId: string; displayName: string }>;
};

const createTask = async (page: Page, title: string, assignee: string) => {
  await page.goto("/tasks/new");
  await page.locator("#m2-task-title").fill(title);
  await page.locator("#m2-task-description").fill(`M7 ${title}`);
  await page.getByRole("button", { name: "担当: 誰でも" }).click();
  await page.getByRole("dialog").getByRole("button", { name: assignee }).click();
  const responsePromise = page.waitForResponse((response) => response.url().endsWith("/api/tasks") && response.request().method() === "POST");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  const response = await responsePromise;
  expect(response.ok()).toBeTruthy();
  await expect(page).toHaveURL(/\/home$/);
  return (await response.json()).data.task.id as string;
};

test("M7 real two-user Task sync uses separate sessions and canonical UI actions", async ({ browser }: { browser: Browser }) => {
  const id = stamp();
  const nameA = `M7 Owner ${id}`;
  const nameB = `M7 Member ${id}`;
  const contextA = await browser.newContext({ locale: "ja-JP", timezoneId: "Asia/Tokyo" });
  const contextB = await browser.newContext({ locale: "ja-JP", timezoneId: "Asia/Tokyo" });
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  await waitForApp(pageA);
  await register(pageA, `m7-owner-${id}@example.test`, nameA);
  await createHousehold(pageA, `M7 House ${id}`);
  const invite = await issueInvite(pageA);
  await register(pageB, `m7-member-${id}@example.test`, nameB);
  await joinHousehold(pageB, invite);
  const sessionA = (await contextA.cookies()).find((cookie) => cookie.name === "house_todo_session")?.value;
  const sessionB = (await contextB.cookies()).find((cookie) => cookie.name === "house_todo_session")?.value;
  expect(sessionA).toBeTruthy();
  expect(sessionB).toBeTruthy();
  expect(sessionA).not.toBe(sessionB);

  const memberB = (await members(pageA)).find((member) => member.displayName === nameB);
  expect(memberB).toBeTruthy();
  const title = `M7 shared task ${id}`;
  const taskId = await createTask(pageA, title, nameB);

  await pageB.goto("/home");
  await expect(pageB.getByRole("button", { name: `${title}を完了` })).toBeVisible();
  await expect(pageB.getByRole("img", { name: `担当: ${nameB}` })).toBeVisible();
  await pageB.screenshot({ path: "docs/evidence/m7/screenshots/task-user-b-created.png" });
  await pageB.getByRole("button", { name: `${title}を完了` }).click();
  await expect(pageB.getByRole("button", { name: /完了済み 1/ })).toBeVisible();

  await pageA.reload();
  await pageA.getByRole("button", { name: /完了済み 1/ }).click();
  const completedRow = pageA.locator(".m2-home__history-list .m2-home__row", { hasText: title });
  await expect(completedRow).toBeVisible();
  await expect(completedRow.getByRole("img", { name: `完了者: ${nameB}` })).toBeVisible();
  await pageA.screenshot({ path: "docs/evidence/m7/screenshots/task-user-a-completed-by-b.png" });
  const completedBox = await completedRow.boundingBox();
  expect(completedBox).not.toBeNull();
  await pageA.mouse.move(completedBox!.x + completedBox!.width * 0.8, completedBox!.y + completedBox!.height / 2);
  await pageA.mouse.down();
  await pageA.mouse.move(completedBox!.x + completedBox!.width * 0.3, completedBox!.y + completedBox!.height / 2, { steps: 6 });
  await pageA.mouse.up();
  await completedRow.getByRole("button", { name: "戻す" }).click();

  await pageB.reload();
  await expect(pageB.getByRole("button", { name: `${title}を完了` })).toBeVisible();
  await pageB.screenshot({ path: "docs/evidence/m7/screenshots/task-user-b-restored.png" });

  await pageA.goto(`/tasks/${taskId}/edit`);
  await expect(pageA.getByRole("heading", { name: "家事を編集" })).toBeVisible();
  const editedTitle = `${title} edited`;
  await pageA.locator("#m2-task-title").fill(editedTitle);
  await pageA.getByRole("button", { name: "保存", exact: true }).click();
  await expect(pageA).toHaveURL(/\/home$/);
  await pageB.goto("/home");
  await expect(pageB.getByText(editedTitle)).toBeVisible();
  await pageB.screenshot({ path: "docs/evidence/m7/screenshots/task-user-b-edit-synced.png" });
  const updatedTask = await pageB.request.get(`/api/tasks/${taskId}`);
  expect(updatedTask.ok()).toBeTruthy();
  expect((await updatedTask.json()).data.task.title).toBe(editedTitle);
  const updatedDashboard = await pageB.request.get("/api/dashboard/today");
  expect(updatedDashboard.ok()).toBeTruthy();
  const dashboardData = (await updatedDashboard.json()).data;
  expect(dashboardData.homeTasks.find((task: { id: string }) => task.id === taskId)?.title).toBe(editedTitle);

  await contextA.close();
  await contextB.close();
});

test("M7 real two-user Shopping sync uses production API data across sessions", async ({ browser }: { browser: Browser }) => {
  const id = stamp();
  const nameA = `M7 Shopping Owner ${id}`;
  const nameB = `M7 Shopping Member ${id}`;
  const contextA = await browser.newContext({ locale: "ja-JP", timezoneId: "Asia/Tokyo" });
  const contextB = await browser.newContext({ locale: "ja-JP", timezoneId: "Asia/Tokyo" });
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  await waitForApp(pageA);
  await register(pageA, `m7-shopping-owner-${id}@example.test`, nameA);
  await createHousehold(pageA, `M7 Shopping House ${id}`);
  const invite = await issueInvite(pageA);
  await register(pageB, `m7-shopping-member-${id}@example.test`, nameB);
  await joinHousehold(pageB, invite);

  const item = `M7 shared milk ${id}`;
  await pageA.getByRole("button", { name: "追加" }).click();
  await pageA.getByRole("dialog").getByRole("button", { name: "買い物" }).click();
  await pageA.locator("#shopping-name").fill(item);
  await pageA.locator("#shopping-quantity").fill("1本");
  await pageA.locator("#shopping-planned-purchase-date").fill(new Date().toISOString().slice(0, 10));
  await pageA.getByRole("button", { name: "保存", exact: true }).click();
  await expect(pageA).toHaveURL(/\/shopping\?item=/);
  const reorderedItem = `M7 reordered bread ${id}`;
  await pageA.goto("/shopping/new");
  await pageA.locator("#shopping-name").fill(reorderedItem);
  await pageA.locator("#shopping-quantity").fill("1個");
  await pageA.getByRole("button", { name: "保存", exact: true }).click();
  await pageA.goto("/shopping");
  const firstShoppingRow = pageA.locator("[data-shopping-m4-id]", { hasText: item });
  const secondShoppingRow = pageA.locator("[data-shopping-m4-id]", { hasText: reorderedItem });
  const firstShoppingBox = await firstShoppingRow.boundingBox();
  const secondShoppingBox = await secondShoppingRow.boundingBox();
  expect(firstShoppingBox).not.toBeNull();
  expect(secondShoppingBox).not.toBeNull();
  await pageA.mouse.move(firstShoppingBox!.x + firstShoppingBox!.width / 2, firstShoppingBox!.y + firstShoppingBox!.height / 2);
  await pageA.mouse.down();
  await pageA.waitForTimeout(420);
  await pageA.mouse.move(secondShoppingBox!.x + secondShoppingBox!.width / 2, secondShoppingBox!.y + secondShoppingBox!.height / 2, { steps: 10 });
  await pageA.mouse.up();
  await pageA.waitForTimeout(500);
  const orderA = await pageA.locator("[data-shopping-m4-id]").evaluateAll((elements) => elements.map((element) => element.textContent ?? ""));
  expect(orderA.findIndex((text) => text.includes(reorderedItem))).toBeLessThan(orderA.findIndex((text) => text.includes(item)));
  await pageA.screenshot({ path: "docs/evidence/m7/screenshots/shopping-user-a-reordered.png" });

  await pageB.goto("/shopping");
  await expect(pageB.locator("[data-shopping-m4-id]", { hasText: reorderedItem })).toBeVisible();
  const orderB = await pageB.locator("[data-shopping-m4-id]").evaluateAll((elements) => elements.map((element) => element.textContent ?? ""));
  expect(orderB).toEqual(orderA);
  await pageB.screenshot({ path: "docs/evidence/m7/screenshots/shopping-user-b-reordered.png" });
  const rowB = pageB.locator("[data-shopping-m4-id]", { hasText: item });
  await expect(rowB).toBeVisible();
  await pageB.screenshot({ path: "docs/evidence/m7/screenshots/shopping-user-b-shared.png" });
  await rowB.getByRole("button", { name: new RegExp(item) }).click();
  await rowB.getByRole("button", { name: "購入" }).click();
  await expect(pageB.getByRole("button", { name: /購入済み 1件/ })).toBeVisible();

  await pageA.reload();
  await pageA.getByRole("button", { name: /購入済み 1件/ }).click();
  const purchased = pageA.locator("[data-shopping-m4-id]", { hasText: item });
  await expect(purchased.getByRole("img", { name: `購入者: ${nameB}` })).toBeVisible();
  await pageA.screenshot({ path: "docs/evidence/m7/screenshots/shopping-user-a-sees-b-purchaser.png" });
  await purchased.getByRole("button", { name: new RegExp(item) }).click();
  await purchased.getByRole("button", { name: "戻す" }).click();
  await pageB.reload();
  await expect(pageB.locator("[data-shopping-m4-id]", { hasText: item })).toBeVisible();
  await pageB.screenshot({ path: "docs/evidence/m7/screenshots/shopping-user-b-restored.png" });

  await contextA.close();
  await contextB.close();
});
