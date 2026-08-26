import { copyFile, mkdir } from "node:fs/promises";
import { request, chromium } from "@playwright/test";

const base = process.env.M7_LOCAL_BASE_URL ?? "http://127.0.0.1:8789";
const outputDir = "docs/evidence/m7/motion";
const rawDir = `${outputDir}/raw`;
const password = "very-long-password";
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const setupUser = async (label) => {
  const id = stamp();
  const api = await request.newContext({ baseURL: base, extraHTTPHeaders: { origin: base } });
  const register = await api.post("/api/auth/register", { data: { email: `m7-motion-${label}-${id}@example.test`, displayName: `M7 ${label} Motion`, password } });
  if (!register.ok()) throw new Error(`register failed: ${register.status()}`);
  const household = await api.post("/api/households", { data: { name: `M7 ${label.slice(0, 10)} ${id}` } });
  if (!household.ok()) {
    const current = await api.get("/api/households/current");
    const payload = await current.json().catch(() => ({}));
    if (!current.ok() || !payload.data?.household) throw new Error(`household failed: ${household.status()}`);
  }
  return { api, state: await api.storageState(), id };
};

const record = async (name, action) => {
  const user = await setupUser(name);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: user.state, locale: "ja-JP", timezoneId: "Asia/Tokyo", viewport: { width: 390, height: 844 }, recordVideo: { dir: rawDir, size: { width: 390, height: 844 } } });
  const page = await context.newPage();
  await action(page, user);
  const video = page.video();
  await context.close();
  await browser.close();
  await user.api.dispose();
  if (!video) throw new Error(`${name} video was not recorded`);
  await copyFile(await video.path(), `${outputDir}/${name}.webm`);
};

await mkdir(rawDir, { recursive: true });
await mkdir(outputDir, { recursive: true });

await record("canonical-navigation", async (page) => {
  await page.goto(`${base}/home`);
  await page.getByRole("button", { name: "カレンダー" }).click();
  await page.waitForTimeout(350);
  await page.getByRole("button", { name: "追加" }).click();
  await page.waitForTimeout(250);
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.getByRole("button", { name: "買い物" }).click();
  await page.waitForTimeout(350);
  await page.getByRole("button", { name: "その他" }).click();
  await page.waitForTimeout(350);
  await page.getByRole("button", { name: "ホーム" }).click();
  await page.waitForTimeout(350);
});

await record("two-user-task-sync", async (page) => {
  const title = `M7 motion task ${stamp()}`;
  await page.goto(`${base}/tasks/new`);
  await page.locator("#m2-task-title").fill(title);
  await page.locator("#m2-task-description").fill("M7 motion");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.waitForTimeout(350);
  await page.getByRole("button", { name: `${title}を完了` }).click();
  await page.waitForTimeout(350);
  await page.getByRole("button", { name: /完了済み 1/ }).click();
  await page.waitForTimeout(350);
  const row = page.locator(".m2-home__history-list .m2-home__row", { hasText: title });
  const box = await row.boundingBox();
  if (!box) throw new Error("task history row not visible");
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  await row.getByRole("button", { name: "戻す" }).click();
  await page.waitForTimeout(350);
});

await record("two-user-shopping-sync", async (page) => {
  const item = `M7 motion item ${stamp()}`;
  await page.goto(`${base}/shopping/new`);
  await page.locator("#shopping-name").fill(item);
  await page.locator("#shopping-quantity").fill("1個");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.waitForTimeout(350);
  await page.goto(`${base}/shopping`);
  await page.waitForTimeout(350);
  const row = page.locator("[data-shopping-m4-id]", { hasText: item });
  await row.getByRole("button", { name: new RegExp(item) }).click();
  await row.getByRole("button", { name: "購入" }).click();
  await page.waitForTimeout(350);
  await page.getByRole("button", { name: /購入済み 1件/ }).click();
  const purchased = page.locator("[data-shopping-m4-id]", { hasText: item });
  await purchased.getByRole("button", { name: new RegExp(item) }).click();
  await purchased.getByRole("button", { name: "戻す" }).click();
  await page.waitForTimeout(350);
});

await record("pwa-reload-deeplink", async (page, user) => {
  const item = `M7 PWA item ${user.id}`;
  const response = await user.api.post("/api/shopping/items", { data: { name: item, quantity: "1個", plannedPurchaseDate: new Date().toISOString().slice(0, 10) } });
  if (!response.ok()) throw new Error(`shopping setup failed: ${response.status()}`);
  const itemId = (await response.json()).data.item.id;
  await page.goto(`${base}/shopping?item=${encodeURIComponent(itemId)}`);
  await page.waitForTimeout(500);
  await page.reload();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "カレンダー" }).click();
  await page.waitForTimeout(350);
  await page.reload();
  await page.getByRole("button", { name: "ホーム" }).click();
  await page.waitForTimeout(350);
});

console.log(JSON.stringify({ base, outputs: ["canonical-navigation.webm", "two-user-task-sync.webm", "two-user-shopping-sync.webm", "pwa-reload-deeplink.webm"] }));
