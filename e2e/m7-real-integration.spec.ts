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

const dateKey = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const calendarDateLabel = (value: string) => `${Number(value.slice(5, 7))}月${Number(value.slice(8, 10))}日`;

const swipeLeft = async (page: Page, row: ReturnType<Page["locator"]>) => {
  const box = await row.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width * 0.82, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width * 0.25, box!.y + box!.height / 2, { steps: 8 });
  await page.mouse.up();
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
  await expect(pageA.getByRole("button", { name: `${title}を完了` })).toBeVisible();
  await pageA.screenshot({ path: "docs/evidence/m7/screenshots/task-user-a-created.png" });

  await pageB.goto("/home");
  await expect(pageB.getByRole("button", { name: `${title}を完了` })).toBeVisible();
  await expect(pageB.getByRole("img", { name: `担当: ${nameB}` })).toBeVisible();
  await pageB.screenshot({ path: "docs/evidence/m7/screenshots/task-user-b-created.png" });
  await pageB.getByRole("button", { name: `${title}を完了` }).click();
  await expect(pageB.getByRole("button", { name: /完了済み 1/ })).toBeVisible();
  await pageB.screenshot({ path: "docs/evidence/m7/screenshots/task-user-b-completed.png" });

  await pageA.reload();
  await pageA.getByRole("button", { name: /完了済み 1/ }).click();
  const completedRow = pageA.locator(".m2-home__history-list .m2-home__row", { hasText: title });
  await expect(completedRow).toBeVisible();
  await expect(completedRow.getByRole("img", { name: `完了者: ${nameB}` })).toBeVisible();
  await pageA.screenshot({ path: "docs/evidence/m7/screenshots/task-user-a-completed-by-b.png" });
  const completedBox = await completedRow.boundingBox();
  expect(completedBox).not.toBeNull();
  await swipeLeft(pageA, completedRow);
  await completedRow.getByRole("button", { name: "戻す" }).click();
  await expect(pageA.getByRole("button", { name: `${title}を完了` })).toBeVisible();
  await pageA.screenshot({ path: "docs/evidence/m7/screenshots/task-user-a-restored.png" });

  await pageB.reload();
  await expect(pageB.getByRole("button", { name: `${title}を完了` })).toBeVisible();
  await pageB.screenshot({ path: "docs/evidence/m7/screenshots/task-user-b-restored.png" });

  await pageA.goto(`/tasks/${taskId}/edit`);
  await expect(pageA.getByRole("heading", { name: "家事を編集" })).toBeVisible();
  const editedTitle = `${title} edited`;
  await pageA.locator("#m2-task-title").fill(editedTitle);
  await pageA.getByRole("button", { name: "保存", exact: true }).click();
  await expect(pageA).toHaveURL(/\/home$/);
  await pageA.screenshot({ path: "docs/evidence/m7/screenshots/task-user-a-edit-saved.png" });
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
  const plannedDate = dateKey();
  await pageA.locator("#shopping-planned-purchase-date").fill(plannedDate);
  await pageA.getByRole("button", { name: "保存", exact: true }).click();
  await expect(pageA).toHaveURL(/\/shopping\?item=/);
  const itemId = new URL(pageA.url()).searchParams.get("item");
  expect(itemId).toBeTruthy();
  await expect(pageA.locator("[data-shopping-m4-id]", { hasText: item })).toHaveClass(/is-expanded/);
  await pageA.screenshot({ path: "docs/evidence/m7/screenshots/shopping-user-a-added.png" });
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
  await expect(pageB.locator("[data-shopping-m4-id]", { hasText: item })).toBeVisible();
  await pageB.screenshot({ path: "docs/evidence/m7/screenshots/shopping-user-b-shared.png" });
  const orderB = await pageB.locator("[data-shopping-m4-id]").evaluateAll((elements) => elements.map((element) => element.textContent ?? ""));
  expect(orderB).toEqual(orderA);
  await pageB.screenshot({ path: "docs/evidence/m7/screenshots/shopping-user-b-reordered.png" });
  const rowB = pageB.locator("[data-shopping-m4-id]", { hasText: item });
  await expect(rowB).toBeVisible();
  await rowB.getByRole("button", { name: new RegExp(item) }).click();
  await rowB.getByRole("button", { name: "購入" }).click();
  await expect(pageB.getByRole("button", { name: /購入済み 1件/ })).toBeVisible();
  await pageB.screenshot({ path: "docs/evidence/m7/screenshots/shopping-user-b-purchased.png" });

  await pageA.reload();
  await pageA.getByRole("button", { name: /購入済み 1件/ }).click();
  const purchased = pageA.locator("[data-shopping-m4-id]", { hasText: item });
  await expect(purchased.getByRole("img", { name: `購入者: ${nameB}` })).toBeVisible();
  await pageA.screenshot({ path: "docs/evidence/m7/screenshots/shopping-user-a-sees-b-purchaser.png" });
  const purchasedResponse = await pageA.request.get(`/api/shopping/items/${itemId}`);
  expect(purchasedResponse.ok()).toBeTruthy();
  const purchasedData = (await purchasedResponse.json()).data.item as { purchasedAt: string | null; purchasedBy: { displayName: string } | null; plannedPurchaseDate: string | null };
  expect(purchasedData.purchasedBy?.displayName).toBe(nameB);
  expect(purchasedData.purchasedAt).toEqual(expect.any(String));
  expect(Date.parse(purchasedData.purchasedAt!)).not.toBeNaN();
  expect(purchasedData.plannedPurchaseDate).toBe(plannedDate);
  await purchased.getByRole("button", { name: new RegExp(item) }).click();
  const displayedPurchaseTime = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo"
  }).format(new Date(purchasedData.purchasedAt!));
  await expect(purchased).toContainText(displayedPurchaseTime);
  await swipeLeft(pageA, purchased);
  await purchased.getByRole("button", { name: "戻す" }).click();
  await expect(pageA.getByRole("button", { name: /購入済み 0件/ })).toBeVisible();
  await pageA.screenshot({ path: "docs/evidence/m7/screenshots/shopping-user-a-restored.png" });
  await pageB.reload();
  await expect(pageB.locator("[data-shopping-m4-id]", { hasText: item })).toBeVisible();
  const restoredResponse = await pageB.request.get(`/api/shopping/items/${itemId}`);
  expect(restoredResponse.ok()).toBeTruthy();
  const restoredData = (await restoredResponse.json()).data.item as { status: string; plannedPurchaseDate: string | null; purchasedAt: string | null };
  expect(restoredData.status).toBe("pending");
  expect(restoredData.plannedPurchaseDate).toBe(plannedDate);
  expect(restoredData.purchasedAt).toBeNull();
  const restoredRow = pageB.locator("[data-shopping-m4-id]", { hasText: item });
  await restoredRow.getByRole("button", { name: new RegExp(item) }).click();
  await expect(restoredRow.getByText(/購入予定日/)).toBeVisible();
  await pageB.screenshot({ path: "docs/evidence/m7/screenshots/shopping-user-b-restored-planned.png" });

  await pageB.goto("/calendar");
  const plannedCell = pageB.locator(`.calendar-day-cell[aria-label^="${calendarDateLabel(plannedDate)}"]`);
  await expect(plannedCell).toHaveAttribute("aria-label", /買い物1件/);
  await plannedCell.click();
  await expect(pageB.getByRole("heading", { name: "買うもの" })).toBeVisible();
  await pageB.getByRole("button", { name: new RegExp(item) }).click();
  await expect(pageB).toHaveURL(new RegExp(`/shopping\\?item=${itemId}`));
  const deepLinkedRow = pageB.locator("[data-shopping-m4-id]", { hasText: item });
  await expect(deepLinkedRow).toHaveClass(/is-expanded/);
  await expect(deepLinkedRow.getByRole("button", { name: "購入" })).toBeVisible();

  await contextA.close();
  await contextB.close();
});

test("M7 real Task Pass sync uses pointer swipe and Production history actor", async ({ browser }: { browser: Browser }) => {
  const id = stamp();
  const nameA = `M7 Pass Owner ${id}`;
  const nameB = `M7 Pass Member ${id}`;
  const contextA = await browser.newContext({ locale: "ja-JP", timezoneId: "Asia/Tokyo" });
  const contextB = await browser.newContext({ locale: "ja-JP", timezoneId: "Asia/Tokyo" });
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  await waitForApp(pageA);
  await register(pageA, `m7-pass-owner-${id}@example.test`, nameA);
  await createHousehold(pageA, `M7 Pass House ${id}`);
  const invite = await issueInvite(pageA);
  await register(pageB, `m7-pass-member-${id}@example.test`, nameB);
  await joinHousehold(pageB, invite);
  const title = `M7 passed task ${id}`;
  const taskId = await createTask(pageA, title, nameB);
  await pageB.goto("/home");
  const activeRow = pageB.locator(".m2-home__task-list .m2-home__row", { hasText: title });
  await expect(activeRow).toBeVisible();
  await swipeLeft(pageB, activeRow);
  await activeRow.getByRole("button", { name: "パス" }).click();
  await expect(pageB.getByRole("button", { name: /パス済み 1/ })).toBeVisible();
  await pageA.reload();
  const passedToggle = pageA.getByRole("button", { name: /パス済み 1/ });
  await expect(passedToggle).toBeVisible();
  await passedToggle.click();
  const passedRow = pageA.locator(".m2-home__history--passed .m2-home__row", { hasText: title });
  await expect(passedRow).toBeVisible();
  await expect(passedRow.getByRole("img", { name: `担当: ${nameB}` })).toBeVisible();
  const historyResponse = await pageA.request.get(`/api/tasks/${taskId}/history`);
  expect(historyResponse.ok()).toBeTruthy();
  const records = (await historyResponse.json()).data.records as Array<{ taskId?: string; status: string; actedBy: { displayName: string } }>;
  const skipped = records.find((record) => record.status === "skipped");
  expect(skipped?.taskId ?? taskId).toBe(taskId);
  expect(skipped?.actedBy.displayName).toBe(nameB);
  await contextA.close();
  await contextB.close();
});

test("M7 Other household permission, member sync, and logout isolation use separate sessions", async ({ browser }: { browser: Browser }) => {
  const id = stamp();
  const nameA = `M7 Other Owner ${id}`;
  const nameB = `M7 Other Member ${id}`;
  const contextA = await browser.newContext({ locale: "ja-JP", timezoneId: "Asia/Tokyo" });
  const contextB = await browser.newContext({ locale: "ja-JP", timezoneId: "Asia/Tokyo" });
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  await waitForApp(pageA);
  await register(pageA, `m7-other-owner-${id}@example.test`, nameA);
  await createHousehold(pageA, `M7 Other House ${id}`);
  const invite = await issueInvite(pageA);
  await register(pageB, `m7-other-member-${id}@example.test`, nameB);
  await joinHousehold(pageB, invite);
  const initialA = await members(pageA);
  const initialB = await members(pageB);
  expect(initialA).toHaveLength(2);
  expect(initialB.map((member) => member.userId).sort()).toEqual(initialA.map((member) => member.userId).sort());
  const renamedB = `${nameB} renamed`;
  await pageB.goto("/other/account");
  await pageB.getByRole("textbox", { name: "表示名" }).fill(renamedB);
  await pageB.getByRole("textbox", { name: "表示名" }).blur();
  await expect(pageB.getByRole("status")).toContainText("保存しました");
  await pageA.goto("/other/members");
  await expect(pageA.locator(".m5-member-row")).toHaveCount(2);
  await expect(pageA.locator(".m5-member-row").filter({ hasText: renamedB })).toBeVisible();

  const householdName = `M7 Household Updated ${id}`;
  await pageA.goto("/other/household");
  await pageA.getByRole("textbox", { name: "家庭名" }).fill(householdName);
  await pageA.getByRole("button", { name: /タイムゾーン:/ }).click();
  await pageA.getByRole("dialog").getByRole("button", { name: "America/Los_Angeles" }).click();
  await pageA.getByRole("button", { name: "保存", exact: true }).click();
  await expect(pageA.getByRole("status")).toContainText("保存しました");
  const forbidden = await pageB.request.patch("/api/households/current", { headers: originHeader(pageB), data: { name: `B must not update ${id}` } });
  expect([401, 403]).toContain(forbidden.status());
  await pageB.goto("/other/household");
  await expect(pageB.getByRole("textbox", { name: "家庭名" })).toHaveValue(householdName);
  await expect(pageB.getByRole("textbox", { name: "家庭名" })).toBeDisabled();
  await expect(pageB.getByRole("button", { name: /タイムゾーン:/ })).toBeDisabled();
  await pageB.goto("/home");
  await expect(pageB.getByRole("heading", { name: "やること" })).toBeVisible();
  await pageB.goto("/calendar");
  await expect(pageB.getByRole("grid", { name: /カレンダー/ })).toBeVisible();

  await pageA.goto("/other/account");
  await pageA.getByRole("button", { name: "ログアウト" }).first().click();
  await pageA.getByRole("dialog").getByRole("button", { name: "ログアウト" }).click();
  await expect(pageA).toHaveURL(/\/login$/);
  await pageB.reload();
  await expect(pageB).toHaveURL(/\/calendar$/);
  await pageB.getByRole("button", { name: "ホーム" }).click();
  await expect(pageB).toHaveURL(/\/home$/);
  await expect(pageB.getByRole("heading", { name: "やること" })).toBeVisible();
  await contextA.close();
  await contextB.close();
});
