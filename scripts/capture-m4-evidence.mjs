/* global document, HTMLElement */
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const gitRoot = root.replace(/[\\/]+$/, "");
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
  if (mode === "empty") return { pending: [], purchased: [] };
  const photo = { available: true, width: 320, height: 240, size: 1000, updatedAt: "2026-08-24T00:00:00.000Z" };
  const purchased = [
    item("shop-purchased", "ヨーグルト", { sortOrder: 7, status: "purchased", quantity: "2個", purchasedBy: { userId: "user-2", displayName: "たくや" }, purchasedAt: "2026-08-24T01:32:00.000Z" }),
    item("shop-purchased-photo", "玉ねぎ", { sortOrder: 8, status: "purchased", quantity: "3個", image: photo, purchasedBy: { userId: "user-1", displayName: "はる" }, purchasedAt: "2026-08-23T17:20:00.000Z" })
  ];
  if (mode === "filtered") return {
    pending: [item("filtered-pending", "バナナ", { quantity: "1房", sortOrder: 1 })],
    purchased: [purchased[0], item("old", "過去の購入品", { status: "purchased", purchasedBy: { userId: "user-2", displayName: "たくや" }, purchasedAt: "2026-08-01T01:32:00.000Z" })]
  };
  if (mode === "many") return { pending: Array.from({ length: 8 }, (_, index) => item(`many-${index}`, `買い物 ${index + 1}`, { sortOrder: index + 1, createdAt: `2026-08-${String(index + 10).padStart(2, "0")}T00:00:00.000Z` })), purchased: [] };
  if (mode === "quantity-empty") return { pending: [item("quantity-empty", "レモン", { note: "炭酸水に使う。" }), item("quantity-banana", "バナナ", { quantity: "1房", sortOrder: 2 })], purchased: [] };
  if (mode === "planned-date") {
    return { pending: [item("planned-milk", "牛乳", { quantity: "1本", plannedPurchaseDate: "2026-08-20", image: photo }), item("planned-tofu", "木綿豆腐", { quantity: "2丁", plannedPurchaseDate: "2026-08-23", sortOrder: 2 }), item("planned-tomato", "ミニトマト", { quantity: "1パック", plannedPurchaseDate: "2026-08-24", sortOrder: 3 })], purchased };
  }
  if (mode === "photo") return {
    pending: [item("shop-detergent", "洗濯洗剤", { quantity: "詰替え 1袋", image: photo }), item("shop-tomato", "ミニトマト", { quantity: "1パック", note: "完熟のもの", sortOrder: 2 }), item("shop-banana", "バナナ", { quantity: "1房", sortOrder: 3 })],
    purchased: []
  };
  if (mode === "long-text") return {
    pending: [item("long-text", "家族みんなで食べられる甘さ控えめの季節のフルーツ", { quantity: "大きめ 1パック", note: "冷蔵庫の一番上に入れられるサイズで、傷みの少ないものを選ぶ。", image: photo }), item("long-text-second", "週末の作り置きに使う葉物野菜", { quantity: "2袋", sortOrder: 2 })],
    purchased: []
  };
  if (mode === "deleted") return { pending: [item("shop-banana", "バナナ", { sortOrder: 1, quantity: "1房" }), item("shop-tofu", "木綿豆腐", { sortOrder: 2, quantity: "2丁", note: "賞味期限長め" }), item("shop-detergent", "洗濯洗剤", { sortOrder: 3, quantity: "詰替え 1袋", image: photo }), item("shop-tomato", "ミニトマト", { sortOrder: 4, quantity: "1パック", note: "完熟のもの" }), item("shop-bread", "食パン", { sortOrder: 5, quantity: "6枚切り 1袋" })], purchased };
  const milk = item("shop-milk", "牛乳", { quantity: "1本", note: "メモは非表示", plannedPurchaseDate: mode === "no-planned-date" ? null : "2026-08-20", image: mode === "edit-normal" ? null : photo });
  const banana = item("shop-banana", "バナナ", { sortOrder: 2, quantity: "1房" });
  const tofu = item("shop-tofu", "木綿豆腐", { sortOrder: 3, quantity: "2丁", note: "賞味期限長め" });
  const detergent = item("shop-detergent", "洗濯洗剤", { sortOrder: 4, quantity: "詰替え 1袋", image: photo });
  const tomato = item("shop-tomato", mode === "long-text" ? "家族みんなで食べられる甘さ控えめの季節のミニトマト" : "ミニトマト", { sortOrder: 5, quantity: "1パック", note: "完熟のもの" });
  const bread = item("shop-bread", "食パン", { sortOrder: 6, quantity: "6枚切り 1袋" });
  return { pending: [milk, banana, tofu, detergent, tomato, bread], purchased };
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
async function assertProductionFixture(page, file, fixture, url) {
  if (url === "/shopping") {
    const activeCount = await page.locator(".shopping-m4__list [data-shopping-m4-id]").count();
    const expected = { normal: 6, "planned-date": 3, "no-planned-date": 6, many: 8, "long-text": 2, empty: 0, photo: 3, "quantity-empty": 2, filtered: 1, deleted: 5 }[fixture];
    if (expected === undefined || activeCount !== expected) throw new Error(`Production fixture assertion failed for ${file}: ${activeCount} active rows, expected ${expected}`);
    if (file.includes("purchased-open") || file.includes("purchased-auto-filtered")) {
      const visiblePurchased = await page.locator(".shopping-m4__purchased [data-shopping-m4-id]").count();
      const expectedPurchased = file.includes("auto-filtered") ? 1 : 2;
      if (visiblePurchased !== expectedPurchased) throw new Error(`Production purchased fixture assertion failed for ${file}: ${visiblePurchased} rows, expected ${expectedPurchased}`);
    }
    if (file.includes("quantity-empty") && await page.locator('[data-shopping-m4-id="quantity-empty"] .shopping-m4__quantity').count() !== 0) throw new Error("Production quantity-empty fixture still renders quantity");
    if (file.includes("photo") && await page.locator('[data-shopping-m4-id="shop-detergent"] .shopping-m4__expanded img').count() !== 1) throw new Error("Production photo fixture is not expanded with a photo");
  }
  if (file.includes("reuse-selected") && await page.locator(".shopping-m4-form input[type=file]").count() !== 1) throw new Error("Production reuse-selected form lost the OS image picker");
  if (fixture === "edit-normal" && await page.locator(".shopping-image-preview").count() !== 0) throw new Error("Production edit-normal fixture unexpectedly contains an image");
}
async function productionShot(browser, file, fixture, url = "/shopping", interact, extraInteract) {
  interact = extraInteract ?? interact;
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await mockProduction(page);
  await page.goto(`${production}${url}${url.includes("?") ? "&" : "?"}fixture=${fixture}`, { waitUntil: "networkidle" });
  if (url.includes("/shopping/new") || url.includes("/shopping/items/")) await page.locator(".shopping-m4-form-header").waitFor();
  else await page.locator(".shopping-m4").waitFor();
  if (interact) await interact(page);
  await assertProductionFixture(page, file, fixture, url);
  await settle(page);
  await page.screenshot({ path: `${evidence}/production/${file}.png`, fullPage: true });
  await page.close();
}
const requireMockup = (condition, message) => { if (!condition) throw new Error(`Mockup state assertion failed: ${message}`); };
async function assertMockupState(page, route, state) {
  if (route === "/shopping") {
    const active = page.locator('[data-uilab-component="Shopping.ItemRow"]');
    const purchased = page.locator('[data-uilab-component="Shopping.PurchasedRow"]');
    const expanded = page.locator('[data-uilab-component="Shopping.ItemExpanded"]');
    const purchasedToggle = page.locator('[data-uilab-id="shopping-purchased-section"] .shopping-purchased__toggle');
    const activeCount = await active.count();
    const purchasedCount = await purchased.count();
    const expandedCount = await expanded.count();
    const plannedCount = await page.locator('[data-uilab-component="Shopping.ItemRow.PlannedDate"]').count();
    const expected = {
      normal: [6, 0, 0], "planned-date": [3, 0, 0], "no-planned-date": [6, 0, 0], many: [15, 0, 0],
      "long-text": [2, 0, 1], empty: [0, 0, 0], deleted: [5, 0, 0], "quantity-empty": [2, 0, 0],
      expanded: [6, 0, 1], photo: [3, 0, 1], "purchased-open": [6, 2, 0], "purchased-auto-filtered": [1, 1, 0]
    }[state];
    requireMockup(Boolean(expected), `unknown shopping state ${state}`);
    requireMockup(activeCount === expected[0], `${state} active item count ${activeCount} !== ${expected[0]}`);
    requireMockup(purchasedCount === expected[1], `${state} purchased item count ${purchasedCount} !== ${expected[1]}`);
    requireMockup(expandedCount === expected[2], `${state} expanded item count ${expandedCount} !== ${expected[2]}`);
    if (state === "planned-date") requireMockup(plannedCount === 3, "planned-date has three planned rows");
    if (state === "no-planned-date") requireMockup(plannedCount === 0, "no-planned-date has no planned rows");
    if (state === "quantity-empty") requireMockup(await page.locator('[data-uilab-id="shopping-no-quantity"] [data-uilab-component="Shopping.ItemRow.Quantity"]').count() === 0, "quantity-empty still renders quantity");
    if (state === "photo") requireMockup(await page.locator('[data-uilab-id="shopping-item-shopping-detergent-expanded"] [data-uilab-component="Shopping.ItemPhoto"]').count() === 1, "photo fixture is not expanded with photo");
    if (state === "expanded") requireMockup(await page.locator('[data-uilab-id="shopping-item-shopping-milk-expanded"] [data-uilab-component="Shopping.ItemPurchaseButton"]').count() === 1, "expanded fixture has no purchase action");
    if (state === "purchased-open" || state === "purchased-auto-filtered") requireMockup(await purchasedToggle.getAttribute("aria-expanded") === "true", `${state} purchased section is not open`);
    if (state === "empty") requireMockup(await page.locator('[data-uilab-id="shopping-empty-state"]').count() === 1, "empty state is not visible");
    if (state === "deleted") requireMockup(await page.locator('[data-uilab-id="shopping-milk"]').count() === 0, "deleted item is still present");
  } else {
    requireMockup(await page.locator('[data-uilab-id="shopping-form-page"]').count() === 1, `${route} form is not visible`);
    const name = page.locator('[data-uilab-component="ShoppingForm.Name"] input');
    const photo = page.locator('[data-uilab-component="ShoppingForm.Photo"] img');
    if (state === "reuse-picker") requireMockup(await page.locator('[data-uilab-id="shopping-reuse-sheet"]').count() === 1, "reuse picker sheet is not open");
    if (state === "reuse-selected") requireMockup((await name.inputValue()) === "牛乳" && await photo.count() === 1, "reuse-selected is not the photo fixture");
    if (state === "reuse-no-photo-selected") requireMockup((await name.inputValue()) === "バナナ" && await photo.count() === 0, "reuse-no-photo-selected has a photo");
    if (state === "photo-selected") requireMockup(await photo.count() === 1, "photo-selected has no preview");
    if (state === "long-text") requireMockup((await name.inputValue()).length > 20, "long-text form value is not long");
    if (route === "/shopping/edit" && state === "delete-confirm") requireMockup(await page.locator('[data-uilab-id="shopping-delete-confirm"]').count() === 1, "delete confirmation is not open");
  }
}
async function mockupShot(browser, file, state, route = "/shopping", interact) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const path = `${route}?uilabState=${encodeURIComponent(state)}`;
  await page.goto(`${mockup}/#${path}`, { waitUntil: "networkidle" });
  if (interact) await interact(page);
  await page.locator('[data-uilab-id="shopping-page"], [data-uilab-id="shopping-form-page"]').first().waitFor();
  await assertMockupState(page, route, state);
  await settle(page);
  await page.screenshot({ path: `${evidence}/mockup/${file}.png`, fullPage: true });
  await page.close();
}
async function recordMotion(browser, name, fixture, interact) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, recordVideo: { dir: `${evidence}/motion`, size: { width: 390, height: 844 } } });
  const page = await context.newPage();
  await mockProduction(page);
  await page.goto(`${production}/shopping?fixture=${fixture}`, { waitUntil: "networkidle" });
  await page.locator(".shopping-m4").waitFor();
  await page.locator("[data-shopping-m4-id], .shopping-m4__empty").first().waitFor();
  await page.waitForTimeout(550);
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
await productionShot(browser, "02-shopping-planned-date", "planned-date");
await productionShot(browser, "03-shopping-no-planned-date", "no-planned-date");
await productionShot(browser, "04-shopping-many", "many");
await productionShot(browser, "05-shopping-long-text", "long-text", "/shopping", undefined, async (page) => page.locator("[data-shopping-m4-id]").first().getByRole("button").click());
await productionShot(browser, "06-shopping-empty", "empty");
await productionShot(browser, "07-shopping-expanded", "normal", "/shopping", undefined, async (page) => page.locator("[data-shopping-m4-id]").filter({ hasText: "牛乳" }).getByRole("button", { name: /牛乳/ }).click());
await productionShot(browser, "08-shopping-photo", "photo", "/shopping", undefined, async (page) => page.locator("[data-shopping-m4-id]").filter({ hasText: "洗濯洗剤" }).getByRole("button", { name: /洗濯洗剤/ }).click());
await productionShot(browser, "09-shopping-quantity-empty", "quantity-empty");
await productionShot(browser, "10-shopping-purchased-open", "normal", "/shopping", undefined, async (page) => { await page.getByRole("button", { name: /購入済み/ }).click(); await page.locator(".shopping-m4__purchased [data-shopping-m4-id]").first().getByRole("button").click(); });
await productionShot(browser, "11-shopping-purchased-auto-filtered", "filtered", "/shopping", undefined, async (page) => { await page.getByRole("button", { name: /購入済み/ }).click(); await page.locator(".shopping-m4__purchased [data-shopping-m4-id]").first().getByRole("button").click(); });
await productionShot(browser, "12-shopping-deleted", "deleted");
await productionShot(browser, "13-shopping-add-normal", "normal", "/shopping/new");
await productionShot(browser, "14-shopping-reuse-picker", "normal", "/shopping/new", undefined, async (page) => page.getByRole("button", { name: "以前の項目から選ぶ" }).click());
await productionShot(browser, "15-shopping-reuse-selected", "normal", "/shopping/new", undefined, async (page) => { await page.getByRole("button", { name: "以前の項目から選ぶ" }).click(); await page.getByRole("button", { name: /牛乳/ }).click(); });
await productionShot(browser, "16-shopping-reuse-no-photo-selected", "normal", "/shopping/new", undefined, async (page) => { await page.getByRole("button", { name: "以前の項目から選ぶ" }).click(); await page.getByRole("button", { name: /キッチンペーパー/ }).first().click(); });
await productionShot(browser, "17-shopping-photo-selected", "normal", "/shopping/new", undefined, async (page) => page.locator("#shopping-image").setInputFiles(portraitPath));
await productionShot(browser, "18-shopping-add-long-text", "normal", "/shopping/new", undefined, async (page) => page.locator("#shopping-name").fill("とても長い商品名を入力した場合にもフォームが崩れないか確認する"));
await productionShot(browser, "19-shopping-edit-normal", "edit-normal", "/shopping/items/shop-milk/edit");
await productionShot(browser, "20-shopping-delete-confirm", "edit-normal", "/shopping/items/shop-milk/edit", undefined, async (page) => page.getByRole("button", { name: "削除", exact: true }).click());

for (const [file, state] of [["01-shopping-normal", "normal"], ["02-shopping-planned-date", "planned-date"], ["03-shopping-no-planned-date", "no-planned-date"], ["04-shopping-many", "many"], ["05-shopping-long-text", "long-text"], ["06-shopping-empty", "empty"], ["07-shopping-expanded", "expanded"], ["08-shopping-photo", "photo"], ["09-shopping-quantity-empty", "quantity-empty"], ["10-shopping-purchased-open", "purchased-open"], ["11-shopping-purchased-auto-filtered", "purchased-auto-filtered"], ["12-shopping-deleted", "deleted"]]) await mockupShot(browser, file, state);
for (const [file, state] of [["13-shopping-add-normal", "normal"], ["14-shopping-reuse-picker", "reuse-picker"], ["15-shopping-reuse-selected", "reuse-selected"], ["16-shopping-reuse-no-photo-selected", "reuse-no-photo-selected"], ["17-shopping-photo-selected", "photo-selected"], ["18-shopping-add-long-text", "long-text"]]) await mockupShot(browser, file, state, "/shopping/new");
await mockupShot(browser, "19-shopping-edit-normal", "normal", "/shopping/edit");
await mockupShot(browser, "20-shopping-delete-confirm", "delete-confirm", "/shopping/edit");

await recordMotion(browser, "shopping-expand-collapse", "normal", async (page) => { const milk = page.locator("[data-shopping-m4-id]").filter({ hasText: "牛乳" }); const banana = page.locator("[data-shopping-m4-id]").filter({ hasText: "バナナ" }); await milk.getByRole("button", { name: /牛乳/ }).click(); await page.waitForTimeout(220); await banana.getByRole("button", { name: /バナナ/ }).click(); await page.waitForTimeout(220); await banana.getByRole("button", { name: /バナナ/ }).click(); });
await recordMotion(browser, "shopping-purchase-restore", "normal", async (page) => { const milk = page.locator("[data-shopping-m4-id]").filter({ hasText: "牛乳" }); await milk.getByRole("button", { name: /牛乳/ }).click(); await milk.getByRole("button", { name: "購入" }).click(); await page.getByRole("button", { name: /購入済み/ }).click(); const purchased = page.locator("[data-shopping-m4-id]").filter({ hasText: "牛乳" }); await purchased.getByRole("button", { name: /牛乳/ }).click(); await purchased.getByRole("button", { name: "戻す" }).click(); });
await recordMotion(browser, "shopping-swipe-edit", "normal", async (page) => { const row = page.locator("[data-shopping-m4-id]").filter({ hasText: "バナナ" }); const box = await row.boundingBox(); if (!box) throw new Error("swipe row missing"); await page.mouse.move(box.x + 300, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + 100, box.y + box.height / 2, { steps: 10 }); await page.mouse.up(); await page.waitForTimeout(400); });
await recordMotion(browser, "shopping-reorder", "many", async (page) => {
  const rows = page.locator("[data-shopping-m4-id]");
  const before = await rows.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-shopping-m4-id")));
  const expected = Array.from({ length: 8 }, (_, index) => `many-${index}`);
  if (before.join(",") !== expected.join(",")) throw new Error(`reorder initial order mismatch: ${before.join(",")}`);
  const row = rows.first(); const target = rows.nth(2); const a = await row.boundingBox(); const b = await target.boundingBox(); if (!a || !b) throw new Error("reorder rows missing");
  const responsePromise = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/shopping/items/reorder");
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await page.mouse.down(); await page.waitForTimeout(420);
  await page.locator(".shopping-m4__row.is-dragging").waitFor({ timeout: 5000 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height * 0.8, { steps: 16 }); await page.waitForTimeout(180);
  const during = await rows.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-shopping-m4-id")));
  if (during.join(",") === before.join(",")) throw new Error("reorder DOM order did not change during actual pointer drag");
  await page.mouse.up();
  const response = await responsePromise; if (!response.ok()) throw new Error(`reorder API failed: ${response.status()}`);
  await page.waitForFunction((previous) => { const current = [...document.querySelectorAll("[data-shopping-m4-id]")].map((element) => element.getAttribute("data-shopping-m4-id")); return current.join(",") !== previous.join(","); }, before);
  const after = await rows.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-shopping-m4-id")));
  if (after.join(",") === before.join(",")) throw new Error("reorder DOM order did not change after actual pointer drag");
  await page.reload({ waitUntil: "networkidle" }); await page.locator("[data-shopping-m4-id]").first().waitFor();
  const reloaded = await page.locator("[data-shopping-m4-id]").evaluateAll((elements) => elements.map((element) => element.getAttribute("data-shopping-m4-id")));
  if (reloaded.join(",") !== after.join(",")) throw new Error(`reorder did not persist after reload: ${reloaded.join(",")}`);
});
await browser.close();
const productionSha = (await execFileAsync("git", ["-c", `safe.directory=${gitRoot.replaceAll("\\", "/")}`, "rev-parse", "HEAD"], { cwd: root })).stdout.trim();
await fs.writeFile(`${evidence}/capture-metadata.json`, JSON.stringify({ productionSha, mockupSha, viewport: "390x844", source: "scripts/capture-m4-evidence.mjs" }, null, 2));
console.log(`M4 evidence captured at ${evidence} for Production ${productionSha} and Mockup ${mockupSha}`);
