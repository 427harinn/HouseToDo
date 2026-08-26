import { copyFile, mkdir } from "node:fs/promises";
import { chromium, request } from "@playwright/test";

const base = process.env.M8B_LOCAL_BASE_URL ?? "http://127.0.0.1:5174";
const outputDir = "docs/evidence/m8b/motion";
const rawDir = `${outputDir}/raw`;
const password = "very-long-password";
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const settle = (page) => page.waitForTimeout(650);
const originHeaders = { origin: base };

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

const post = async (api, path, data, expected = 201) => {
  const response = await api.post(path, { headers: originHeaders, data });
  if (response.status() !== expected)
    throw new Error(`${path} failed: ${response.status()} ${await response.text()}`);
  return response.json();
};

const session = async (prefix, displayName, householdName) => {
  const api = await request.newContext({
    baseURL: base,
    extraHTTPHeaders: originHeaders
  });
  const id = stamp();
  await post(api, "/api/auth/register", {
    email: `${prefix}-${id}@example.test`,
    displayName,
    password
  });
  await post(api, "/api/households", { name: householdName });
  return { api, state: await api.storageState() };
};

const swipeLeft = async (page, row) => {
  const box = await row.boundingBox();
  if (!box) throw new Error("swipe target missing");
  await page.mouse.move(box.x + box.width * 0.82, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
};

const runFlow = async (name, action) => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    viewport: { width: 390, height: 844 },
    recordVideo: { dir: rawDir, size: { width: 390, height: 844 } }
  });
  const page = await context.newPage();
  let source = null;
  try {
    await action(page);
    source = page.video() ? await page.video().path() : null;
  } finally {
    await context.close();
    await browser.close();
  }
  if (!source) throw new Error(`${name} video missing`);
  const output = `${outputDir}/${name}.webm`;
  await copyFile(source, output);
  console.log(JSON.stringify({ name, output }));
};

await mkdir(rawDir, { recursive: true });

await runFlow("legacy-task-regression", async (page) => {
  const id = stamp();
  const owner = await session(
    `m8b-legacy-${id}`,
    `M8B Legacy ${id}`,
    `M8B Legacy House ${id}`
  );
  const title = `Legacy-derived task ${id}`;
  await post(owner.api, "/api/tasks", {
    title,
    modelRecurrenceType: "once",
    startDate: dateKey(),
    targetDate: dateKey(),
    assignmentType: "anyone",
    notificationSlot: "none"
  });
  await page.context().addCookies(owner.state.cookies);
  await page.goto(`${base}/home`);
  await page.getByRole("heading", { name: "やること" }).waitFor();
  await page.getByRole("button", { name: `${title}を完了` }).click();
  await page.getByRole("button", { name: /完了済み 1/ }).click();
  const row = page.locator(".m2-home__history-list .m2-home__row", { hasText: title });
  await row.waitFor();
  await swipeLeft(page, row);
  await row.getByRole("button", { name: "戻す" }).click();
  await page.getByRole("button", { name: `${title}を完了` }).waitFor();
  await page.goto(`${base}/calendar`);
  await page.getByRole("grid", { name: /カレンダー/ }).waitFor();
  await settle(page);
  await owner.api.dispose();
});

await runFlow("shopping-template-reuse", async (page) => {
  const id = stamp();
  const owner = await session(
    `m8b-template-${id}`,
    `M8B Template ${id}`,
    `M8B Template House ${id}`
  );
  const templateName = `Existing template ${id}`;
  await post(owner.api, "/api/shopping/templates", {
    name: templateName,
    quantity: "1個",
    note: "retained"
  });
  await page.context().addCookies(owner.state.cookies);
  await page.goto(`${base}/shopping/new`);
  await page.getByRole("heading", { name: "買い物を追加" }).waitFor();
  await page.getByRole("button", { name: "以前の項目から選ぶ" }).click();
  await page.getByRole("dialog").getByText(templateName, { exact: true }).click();
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.waitForURL(/\/shopping\?item=/);
  await page.goto(`${base}/shopping`);
  await page.getByText(templateName, { exact: true }).waitFor();
  await settle(page);
  await owner.api.dispose();
});

await runFlow("two-user-final-smoke", async (pageA) => {
  const id = stamp();
  const owner = await session(
    `m8b-owner-${id}`,
    `M8B Owner ${id}`,
    `M8B Two User House ${id}`
  );
  const inviteResponse = await owner.api.post("/api/households/current/invites", {
    headers: originHeaders,
    data: {}
  });
  const invite = (await inviteResponse.json()).data.invite.code;
  const member = await request.newContext({
    baseURL: base,
    extraHTTPHeaders: originHeaders
  });
  await post(member, "/api/auth/register", {
    email: `m8b-member-${id}@example.test`,
    displayName: `M8B Member ${id}`,
    password
  });
  await post(member, "/api/households/join", { code: invite }, 200);
  const contextB = await pageA
    .context()
    .browser()
    .newContext({
      storageState: await member.storageState(),
      locale: "ja-JP",
      timezoneId: "Asia/Tokyo",
      viewport: { width: 390, height: 844 }
    });
  const pageB = await contextB.newPage();
  const taskTitle = `Two-user task ${id}`;
  await pageA.context().addCookies(owner.state.cookies);
  await pageA.goto(`${base}/tasks/new`);
  await pageA.locator("#m2-task-title").fill(taskTitle);
  await pageA.getByRole("button", { name: "保存", exact: true }).click();
  await pageA.waitForURL(/\/home$/);
  await pageB.goto(`${base}/home`);
  await pageB.getByRole("button", { name: `${taskTitle}を完了` }).click();
  await pageA.reload();
  await pageA.getByRole("button", { name: /完了済み 1/ }).click();
  await pageA.getByText(taskTitle, { exact: true }).waitFor();
  const item = `Two-user shopping ${id}`;
  await pageA.getByRole("button", { name: "追加" }).click();
  await pageA.getByRole("dialog").getByRole("button", { name: "買い物" }).click();
  await pageA.locator("#shopping-name").fill(item);
  await pageA.getByRole("button", { name: "保存", exact: true }).click();
  await pageB.goto(`${base}/shopping`);
  const shoppingRow = pageB.locator("[data-shopping-m4-id]", { hasText: item });
  await shoppingRow.waitFor();
  await shoppingRow.getByRole("button", { name: new RegExp(item) }).click();
  await shoppingRow.getByRole("button", { name: "購入" }).click();
  await pageA.goto(`${base}/shopping`);
  await pageA.getByRole("button", { name: /購入済み 1件/ }).click();
  await pageA.getByText(item, { exact: true }).waitFor();
  await contextB.close();
  await member.dispose();
  await owner.api.dispose();
});

await runFlow("final-app-smoke", async (page) => {
  const id = stamp();
  const owner = await session(
    `m8b-final-${id}`,
    `M8B Final ${id}`,
    `M8B Final House ${id}`
  );
  await page.context().addCookies(owner.state.cookies);
  for (const path of [
    "/home",
    "/calendar",
    "/tasks/new",
    "/shopping",
    "/other",
    "/home"
  ]) {
    await page.goto(`${base}${path}`);
    await settle(page);
  }
  await page.getByRole("heading", { name: "やること" }).waitFor();
  await owner.api.dispose();
});
