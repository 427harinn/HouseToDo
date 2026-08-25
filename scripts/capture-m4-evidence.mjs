/* global document, HTMLElement */
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const evidence = fileURLToPath(new URL("../docs/evidence/m4/", import.meta.url));
const portraitPath = fileURLToPath(new URL("../e2e/fixtures/shopping-item-portrait.png", import.meta.url));
const production = process.env.M4_PRODUCTION_URL ?? "http://127.0.0.1:5178";
const mockup = process.env.M4_MOCKUP_URL ?? "http://127.0.0.1:4173";
const mockupSha = "db8941dc3056f07862014242a349ae366da59e9c";
const envelope = (data) => ({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data, requestId: "m4-evidence" }) });
const response = (data, status = 200) => ({ ...envelope(data), status });
const imageBuffer = await fs.readFile(new URL("../e2e/fixtures/shopping-item-portrait.png", import.meta.url));

const item = (id, name, overrides = {}) => ({
  id, name, quantity: null, note: null, plannedPurchaseDate: null, status: "pending", addedBy: "user-1",
  purchasedBy: null, purchasedAt: null, sortOrder: 1, createdAt: "2026-08-24T00:00:00.000Z", updatedAt: "2026-08-24T00:00:00.000Z", image: null, ...overrides
});
const stateItems = (mode) => {
  if (mode === "empty" || mode === "deleted") return { pending: [], purchased: [] };
  if (mode === "filtered") return { pending: [], purchased: [item("old", "過去の購入品", { status: "purchased", purchasedBy: { userId: "user-2", displayName: "たくや" }, purchasedAt: "2026-08-01T01:32:00.000Z" })] };
  if (mode === "many") return { pending: Array.from({ length: 8 }, (_, index) => item(`many-${index}`, `買い物 ${index + 1}`, { sortOrder: index + 1, createdAt: `2026-08-${String(index + 10).padStart(2, "0")}T00:00:00.000Z` })), purchased: [] };
  const milk = item("shop-milk", "牛乳", { quantity: "1本", note: "メモは非表示", plannedPurchaseDate: mode === "no-planned-date" || mode === "quantity-empty" ? null : "2026-08-20", image: mode === "photo" ? { available: true, width: 320, height: 240, size: 1000, updatedAt: "2026-08-24T00:00:00.000Z" } : { available: true, width: 320, height: 240, size: 1000, updatedAt: "2026-08-24T00:00:00.000Z" } });
  const banana = item("shop-banana", "バナナ", { sortOrder: 2, quantity: "1房" });
  const tofu = item("shop-tofu", "木綿豆腐", { sortOrder: 3, quantity: "2丁", note: "賞味期限長め" });
  const detergent = item("shop-detergent", "洗濯洗剤", { sortOrder: 4, quantity: "詰替え 1袋", image: { available: true, width: 320, height: 240, size: 1000, updatedAt: "2026-08-24T00:00:00.000Z" } });
  const tomato = item("shop-tomato", mode === "long-text" ? "家族みんなで食べられる甘さ控えめの季節のミニトマト" : "ミニトマト", { sortOrder: 5, quantity: "1パック", note: "完熟のもの" });
  const bread = item("shop-bread", "食パン", { sortOrder: 6, quantity: "6枚切り 1袋" });
  const purchased = item("shop-purchased", "ヨーグルト", { sortOrder: 7, status: "purchased", quantity: "2個", purchasedBy: { userId: "user-2", displayName: "たくや" }, purchasedAt: "2026-08-24T01:32:00.000Z" });
  return { pending: [milk, banana, tofu, detergent, tomato, bread], purchased: [purchased] };
};

async function mockProduction(page) {
  let lastMode = "";
  let list = stateItems("normal");
  const reset = () => {
    const mode = new URL(page.url()).searchParams.get("fixture") ?? "normal";
    if (mode !== lastMode) { lastMode = mode; list = stateItems(mode); }
  };
  await page.route("**/api/**", async (route) => {
    reset();
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/auth/me") return route.fulfill(response({ user: { id: "user-1", email: "evidence@example.test", displayName: "はる", avatarUrl: null } }));
    if (url.pathname === "/api/households/current") return route.fulfill(response({ household: { id: "house-1", name: "Evidence House", timezone: "Asia/Tokyo", weekStartsOn: 1, role: "owner" } }));
    if (url.pathname === "/api/households/current/members") return route.fulfill(response({ members: [{ userId: "user-1", displayName: "はる", role: "owner", color: "#d9f2eb", avatarUrl: null }, { userId: "user-2", displayName: "たくや", role: "member", color: "#e4eef8", avatarUrl: null }] }));
    if (url.pathname === "/api/households/current/image-usage") return route.fulfill(response({ activeCount: 1, activeCountLimit: 50, activeBytes: 1000, activeBytesLimit: 50 * 1024 * 1024, reservedCount: 0, reservedBytes: 0, pendingCleanupBytes: 0, pendingCleanupUnknownCount: 0, storedBytes: 1000, storedBytesKnown: true, storedBytesLimit: 75 * 1024 * 1024, dailyUploadDate: "2026-08-25", dailyUploadCount: 1, dailyUploadLimit: 20 }));
    if (url.pathname === "/api/dashboard/today") return route.fulfill(response({ date: "2026-08-25", household: { id: "house-1", name: "Evidence House" }, summary: { total: 0, pending: 0, inProgress: 0, completed: 0, skipped: 0 }, todayTasks: [], weeklyTasks: [], shopping: { pendingCount: list.pending.length, previewItems: list.pending.slice(0, 2) }, members: [] }));
    if (url.pathname === "/api/shopping/recent") return route.fulfill(response({ items: [{ name: "牛乳", quantity: "1本", note: "低脂肪ではないもの", createdAt: "2026-08-24T00:00:00.000Z" }, { name: "キッチンペーパー", quantity: "1個", note: null, createdAt: "2026-08-23T00:00:00.000Z" }] }));
    if (url.pathname === "/api/shopping/templates") return route.fulfill(response({ templates: [{ id: "template-1", name: "キッチンペーパー", quantity: "1個", note: null, active: true, sortOrder: 1, createdBy: "user-1", createdAt: "2026-08-23T00:00:00.000Z", updatedAt: "2026-08-23T00:00:00.000Z" }] }));
    if (url.pathname === "/api/shopping/items" && request.method() === "GET") return route.fulfill(response(list));
    if (url.pathname === "/api/shopping/items" && request.method() === "POST") {
      const body = request.postDataJSON();
      const created = item(`created-${Date.now()}`, body.name, { quantity: body.quantity ?? null, note: body.note ?? null, plannedPurchaseDate: body.plannedPurchaseDate ?? null, sortOrder: list.pending.length + 1 });
      list.pending = [...list.pending, created];
      return route.fulfill(response({ item: created }, 201));
    }
    if (url.pathname === "/api/shopping/items/reorder" && request.method() === "POST") {
      const ids = request.postDataJSON().itemIds;
      list.pending = ids.map((id) => list.pending.find((entry) => entry.id === id)).filter(Boolean).map((entry, index) => ({ ...entry, sortOrder: index + 1 }));
      return route.fulfill(response({ items: list.pending }));
    }
    const itemMatch = url.pathname.match(/^\/api\/shopping\/items\/([^/]+)(?:\/(purchase|unpurchase|image))?$/);
    if (itemMatch) {
      const [, itemId, action] = itemMatch;
      const all = [...list.pending, ...list.purchased];
      const found = all.find((entry) => entry.id === itemId) ?? item("shop-milk", "牛乳", { image: { available: true, width: 320, height: 240, size: 1000, updatedAt: "2026-08-24T00:00:00.000Z" } });
      if (action === "image" && request.method() === "GET") return route.fulfill({ status: 200, contentType: "image/png", body: imageBuffer });
      if (action === "purchase") { const next = { ...found, status: "purchased", purchasedAt: "2026-08-25T00:00:00.000Z", purchasedBy: { userId: "user-1", displayName: "はる" } }; list.pending = list.pending.filter((entry) => entry.id !== itemId); list.purchased = [...list.purchased.filter((entry) => entry.id !== itemId), next]; return route.fulfill(response({ item: next })); }
      if (action === "unpurchase") { const next = { ...found, status: "pending", purchasedAt: null, purchasedBy: null }; list.purchased = list.purchased.filter((entry) => entry.id !== itemId); list.pending = [...list.pending, next]; return route.fulfill(response({ item: next })); }
      if (request.method() === "GET") return route.fulfill(response({ item: found }));
      if (request.method() === "PATCH") { const body = request.postDataJSON(); const next = { ...found, ...body, updatedAt: "2026-08-25T00:00:00.000Z" }; list.pending = list.pending.map((entry) => entry.id === itemId ? next : entry); list.purchased = list.purchased.map((entry) => entry.id === itemId ? next : entry); return route.fulfill(response({ item: next })); }
      if (request.method() === "DELETE") { list.pending = list.pending.filter((entry) => entry.id !== itemId); list.purchased = list.purchased.filter((entry) => entry.id !== itemId); return route.fulfill(response({})); }
      return route.fulfill(response({ item: found }));
    }
    return route.fulfill(response({}));
  });
}

const settle = async (page) => { await page.waitForTimeout(350); await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined)); await page.mouse.move(1, 1); };
async function productionShot(browser, file, fixture, url = "/shopping", interact, extraInteract) {
  interact = extraInteract ?? interact;
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await mockProduction(page);
  await page.goto(`${production}${url}${url.includes("?") ? "&" : "?"}fixture=${fixture}`, { waitUntil: "networkidle" });
  if (url.includes("/shopping/new") || url.includes("/shopping/items/")) await page.locator(".shopping-m4-form-header").waitFor();
  else await page.locator(".shopping-m4").waitFor();
  if (interact) await interact(page);
  await settle(page);
  await page.screenshot({ path: `${evidence}/production/${file}.png`, fullPage: true });
  await page.close();
}
async function mockupShot(browser, file, shoppingState, route = "/shopping", uiState = "normal", interact) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const path = `${route}?shoppingState=${shoppingState}&uilabState=${uiState}`;
  await page.goto(`${mockup}/#${path}`, { waitUntil: "networkidle" });
  if (interact) await interact(page);
  await settle(page);
  await page.screenshot({ path: `${evidence}/mockup/${file}.png`, fullPage: true });
  await page.close();
}
async function recordMotion(browser, name, fixture, interact) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, recordVideo: { dir: `${evidence}/motion`, size: { width: 390, height: 844 } } });
  const page = await context.newPage();
  await mockProduction(page);
  await page.goto(`${production}/shopping?fixture=${fixture}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await interact(page);
  await page.waitForTimeout(700);
  const video = page.video();
  await context.close();
  if (video) await video.saveAs(`${evidence}/motion/${name}.webm`);
}

await fs.rm(evidence, { recursive: true, force: true });
await Promise.all(["production", "mockup", "motion", "motion/previews", "review-upload"].map((name) => fs.mkdir(`${evidence}/${name}`, { recursive: true })));
const browser = await chromium.launch({ headless: true });
await productionShot(browser, "01-shopping-normal", "normal");
await productionShot(browser, "02-shopping-planned-date", "normal");
await productionShot(browser, "03-shopping-no-planned-date", "no-planned-date");
await productionShot(browser, "04-shopping-many", "many");
await productionShot(browser, "05-shopping-long-text", "long-text");
await productionShot(browser, "06-shopping-empty", "empty");
await productionShot(browser, "07-shopping-expanded", "normal", "/shopping", undefined, async (page) => page.locator("[data-shopping-m4-id]").filter({ hasText: "牛乳" }).getByRole("button", { name: /牛乳/ }).click());
await productionShot(browser, "08-shopping-photo", "photo", "/shopping", undefined, async (page) => page.locator("[data-shopping-m4-id]").filter({ hasText: "牛乳" }).getByRole("button", { name: /牛乳/ }).click());
await productionShot(browser, "09-shopping-quantity-empty", "quantity-empty");
await productionShot(browser, "10-shopping-purchased-open", "normal", "/shopping", undefined, async (page) => { await page.getByRole("button", { name: /購入済み/ }).click(); await page.locator("[data-shopping-m4-id]").filter({ hasText: "パン" }).getByRole("button", { name: /パン/ }).click(); });
await productionShot(browser, "11-shopping-purchased-auto-filtered", "filtered");
await productionShot(browser, "12-shopping-deleted", "deleted");
await productionShot(browser, "13-shopping-add-normal", "normal", "/shopping/new");
await productionShot(browser, "14-shopping-reuse-picker", "normal", "/shopping/new", undefined, async (page) => page.getByRole("button", { name: "以前の項目から選ぶ" }).click());
await productionShot(browser, "15-shopping-reuse-selected", "normal", "/shopping/new", undefined, async (page) => { await page.getByRole("button", { name: "以前の項目から選ぶ" }).click(); await page.getByRole("button", { name: /牛乳/ }).click(); });
await productionShot(browser, "16-shopping-reuse-no-photo-selected", "normal", "/shopping/new", undefined, async (page) => { await page.getByRole("button", { name: "以前の項目から選ぶ" }).click(); await page.getByRole("button", { name: /キッチンペーパー/ }).first().click(); });
await productionShot(browser, "17-shopping-photo-selected", "normal", "/shopping/new", undefined, async (page) => page.locator("#shopping-image").setInputFiles(portraitPath));
await productionShot(browser, "18-shopping-add-long-text", "normal", "/shopping/new", undefined, async (page) => page.locator("#shopping-name").fill("とても長い商品名を入力した場合にもフォームが崩れないか確認する"));
await productionShot(browser, "19-shopping-edit-normal", "normal", "/shopping/items/shop-milk/edit");
await productionShot(browser, "20-shopping-delete-confirm", "normal", "/shopping/items/shop-milk/edit", undefined, async (page) => page.getByRole("button", { name: "削除", exact: true }).click());

for (const [file, state] of [["01-shopping-normal", "normal"], ["02-shopping-planned-date", "planned-date"], ["03-shopping-no-planned-date", "no-planned-date"], ["04-shopping-many", "many"], ["05-shopping-long-text", "long-text"], ["06-shopping-empty", "empty"], ["07-shopping-expanded", "expanded"], ["08-shopping-photo", "photo"], ["09-shopping-quantity-empty", "quantity-empty"], ["10-shopping-purchased-open", "purchased-open"], ["11-shopping-purchased-auto-filtered", "purchased-auto-filtered"], ["12-shopping-deleted", "deleted"]]) await mockupShot(browser, file, state);
for (const [file, state] of [["13-shopping-add-normal", "normal"], ["14-shopping-reuse-picker", "reuse-picker"], ["15-shopping-reuse-selected", "reuse-selected"], ["16-shopping-reuse-no-photo-selected", "reuse-no-photo-selected"], ["17-shopping-photo-selected", "photo-selected"], ["18-shopping-add-long-text", "long-text"]]) await mockupShot(browser, file, state, "/shopping/new");
await mockupShot(browser, "19-shopping-edit-normal", "normal", "/shopping/edit");
await mockupShot(browser, "20-shopping-delete-confirm", "delete-confirm", "/shopping/edit");

await recordMotion(browser, "shopping-expand-collapse", "normal", async (page) => { const milk = page.locator("[data-shopping-m4-id]").filter({ hasText: "牛乳" }); const banana = page.locator("[data-shopping-m4-id]").filter({ hasText: "バナナ" }); await milk.getByRole("button", { name: /牛乳/ }).click(); await page.waitForTimeout(220); await banana.getByRole("button", { name: /バナナ/ }).click(); await page.waitForTimeout(220); await banana.getByRole("button", { name: /バナナ/ }).click(); });
await recordMotion(browser, "shopping-purchase-restore", "normal", async (page) => { const milk = page.locator("[data-shopping-m4-id]").filter({ hasText: "牛乳" }); await milk.getByRole("button", { name: /牛乳/ }).click(); await milk.getByRole("button", { name: "購入" }).click(); await page.getByRole("button", { name: /購入済み/ }).click(); const purchased = page.locator("[data-shopping-m4-id]").filter({ hasText: "牛乳" }); await purchased.getByRole("button", { name: /牛乳/ }).click(); await purchased.getByRole("button", { name: "戻す" }).click(); });
await recordMotion(browser, "shopping-swipe-edit", "normal", async (page) => { const row = page.locator("[data-shopping-m4-id]").filter({ hasText: "バナナ" }); const box = await row.boundingBox(); if (!box) throw new Error("swipe row missing"); await page.mouse.move(box.x + 300, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + 100, box.y + box.height / 2, { steps: 10 }); await page.mouse.up(); await page.waitForTimeout(400); });
await recordMotion(browser, "shopping-reorder", "many", async (page) => { const row = page.locator("[data-shopping-m4-id]").first(); const target = page.locator("[data-shopping-m4-id]").nth(2); const a = await row.boundingBox(); const b = await target.boundingBox(); if (!a || !b) throw new Error("reorder rows missing"); await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await page.mouse.down(); await page.waitForTimeout(420); await page.mouse.move(b.x + b.width / 2, b.y + b.height + 15, { steps: 12 }); await page.mouse.up(); await page.waitForTimeout(450); });
await browser.close();
const productionSha = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();
await fs.writeFile(`${evidence}/capture-metadata.json`, JSON.stringify({ productionSha, mockupSha, viewport: "390x844", source: "scripts/capture-m4-evidence.mjs" }, null, 2));
console.log(`M4 evidence captured at ${evidence} for Production ${productionSha} and Mockup ${mockupSha}`);
