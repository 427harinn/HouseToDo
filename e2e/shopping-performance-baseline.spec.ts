import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const artifactRoot = path.resolve(
  process.env.PLAYWRIGHT_ARTIFACT_DIR ?? "artifacts/playwright/shopping-performance-baseline"
);
const fixedNow = "2026-08-28T12:00:00+09:00";
const today = "2026-08-28";
const plannedDate = "2026-08-29";
const user = {
  id: "shopping-perf-user",
  email: "shopping-performance@example.test",
  displayName: "買い物計測者",
  avatarUrl: null
};
const household = {
  id: "shopping-perf-household",
  name: "Shopping performance household",
  timezone: "Asia/Tokyo",
  weekStartsOn: 1,
  role: "owner" as const
};

type ShoppingItem = {
  id: string;
  name: string;
  quantity: string | null;
  note: string | null;
  plannedPurchaseDate: string | null;
  status: "pending" | "purchased";
  addedBy: string;
  purchasedBy: { userId: string; displayName: string } | null;
  purchasedAt: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  image: null;
};

type Harness = {
  events: Array<{
    method: string;
    path: string;
    startedAt: number;
    respondedAt?: number;
    bytes?: number;
  }>;
  responseBytes: Record<string, number[]>;
  state: { pending: ShoppingItem[]; purchased: ShoppingItem[] };
};

const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const envelope = (data: unknown) => ({ ok: true, data, requestId: "shopping-performance-baseline" });
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const item = (id: string, name: string, status: ShoppingItem["status"], sortOrder: number, overrides: Partial<ShoppingItem> = {}): ShoppingItem => ({
  id,
  name,
  quantity: "1個",
  note: "計測用メモ",
  plannedPurchaseDate: null,
  status,
  addedBy: user.id,
  purchasedBy: status === "purchased" ? { userId: user.id, displayName: user.displayName } : null,
  purchasedAt: status === "purchased" ? "2026-08-28T03:00:00.000Z" : null,
  sortOrder,
  createdAt: "2026-08-28T00:00:00.000Z",
  updatedAt: "2026-08-28T00:00:00.000Z",
  image: null,
  ...overrides
});

const responseData = (state: Harness["state"], selectedDate = today) => {
  const dates: Record<string, { fixedCount: number; fixedCompletedCount: number; fixedSkippedCount: number; shoppingCount: number; purchasedShoppingCount: number; tasks: never[] }> = {};
  const from = "2026-07-26";
  for (let offset = 0; offset < 42; offset += 1) {
    const date = new Date(`${from}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offset);
    const key = date.toISOString().slice(0, 10);
    const shopping = [...state.pending, ...state.purchased].filter((entry) => entry.plannedPurchaseDate === key);
    dates[key] = { fixedCount: 0, fixedCompletedCount: 0, fixedSkippedCount: 0, shoppingCount: shopping.filter((entry) => entry.status === "pending").length, purchasedShoppingCount: shopping.filter((entry) => entry.status === "purchased").length, tasks: [] };
  }
  const shopping = [...state.pending, ...state.purchased]
    .filter((entry) => entry.plannedPurchaseDate === selectedDate)
    .map((entry) => ({ id: entry.id, name: entry.name, quantity: entry.quantity, note: entry.note, status: entry.status, plannedPurchaseDate: entry.plannedPurchaseDate, purchasedAt: entry.purchasedAt, purchasedBy: entry.purchasedBy }));
  return {
    from,
    to: "2026-09-05",
    today,
    timezone: household.timezone,
    selectedDate,
    dates,
    selected: { fixed: [], weeklyFlexible: [], monthlyFlexible: [], completed: [], shopping }
  };
};

const installApi = async (page: Page, options: { mutationDelayMs?: number } = {}): Promise<Harness> => {
  const state: Harness["state"] = {
    pending: [
      item("milk", "牛乳（計測）", "pending", 1),
      item("bread", "パン（計測）", "pending", 2)
    ],
    purchased: []
  };
  const harness: Harness = { events: [], responseBytes: {}, state };
  page.on("pageerror", (error) => console.log(`SHOPPING_PERF_PAGEERROR ${error.message}\n${error.stack ?? ""}`));
  page.on("console", (message) => {
    if (message.type() === "error") console.log(`SHOPPING_PERF_CONSOLE ${message.text()}`);
  });
  await page.clock.install({ time: new Date(fixedNow) });
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const pathName = url.pathname;
    if (!pathName.startsWith("/api/")) return route.continue();
    const event = { method, path: pathName, startedAt: Date.now() };
    harness.events.push(event);
    let data: unknown;
    let status = 200;
    let delay = 0;
    if (pathName === "/api/auth/me") data = { user };
    else if (pathName === "/api/households/current") data = { household };
    else if (pathName === "/api/households/current/members") data = { members: [{ userId: user.id, displayName: user.displayName, role: "owner", color: null, avatarUrl: null }] };
    else if (pathName === "/api/households/current/image-usage") data = { activeCount: 0, activeCountLimit: 100, activeBytes: 0, activeBytesLimit: 10_000_000, reservedCount: 0, reservedBytes: 0, pendingCleanupBytes: 0, pendingCleanupUnknownCount: 0, storedBytes: 0, storedBytesKnown: true, storedBytesLimit: 20_000_000, dailyUploadDate: today, dailyUploadCount: 0, dailyUploadLimit: 100 };
    else if (pathName === "/api/home/today") data = { date: today, homeTasks: [], completedRecords: [], passedRecords: [], shopping: { pendingCount: state.pending.length }, members: [] };
    else if (pathName === "/api/shopping/items" && method === "GET") data = { pending: clone(state.pending), purchased: clone(state.purchased) };
    else if (pathName === "/api/shopping/items" && method === "POST") {
      const body = request.postDataJSON() as { name: string; quantity?: string | null; note?: string | null; plannedPurchaseDate?: string | null };
      const next = item(`created-${stamp()}`, body.name, "pending", state.pending.length + 1, { quantity: body.quantity ?? null, note: body.note ?? null, plannedPurchaseDate: body.plannedPurchaseDate ?? null });
      state.pending.push(next);
      data = { item: clone(next) };
      status = 201;
    } else if (pathName === "/api/shopping/recent" && method === "GET") data = { items: state.pending.slice(0, 8).map((entry) => ({ name: entry.name, quantity: entry.quantity, note: entry.note, createdAt: entry.createdAt })) };
    else if (pathName === "/api/shopping/templates" && method === "GET") data = { templates: [{ id: "template-milk", name: "牛乳テンプレート", quantity: "1本", note: "いつものもの", active: true, sortOrder: 1, createdBy: user.id, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" }] };
    else if (pathName === "/api/shopping/templates" && method === "POST") { data = { template: {} }; status = 201; }
    else if (pathName === "/api/tasks/calendar/range") data = responseData(state);
    else if (pathName === "/api/tasks/calendar/day") data = responseData(state, url.searchParams.get("date") ?? today);
    else {
      const itemMatch = pathName.match(/^\/api\/shopping\/items\/([^/]+)$/);
      const actionMatch = pathName.match(/^\/api\/shopping\/items\/([^/]+)\/(purchase|unpurchase)$/);
      if (itemMatch && method === "GET") {
        const found = [...state.pending, ...state.purchased].find((entry) => entry.id === decodeURIComponent(itemMatch[1]));
        if (!found) { status = 404; data = { error: { code: "NOT_FOUND", message: "not found" } }; }
        else data = { item: clone(found) };
      } else if (itemMatch && method === "PATCH") {
        const found = [...state.pending, ...state.purchased].find((entry) => entry.id === decodeURIComponent(itemMatch[1]));
        const body = request.postDataJSON() as Partial<ShoppingItem>;
        if (found) Object.assign(found, { name: body.name ?? found.name, quantity: body.quantity ?? null, note: body.note ?? null, plannedPurchaseDate: body.plannedPurchaseDate ?? null, updatedAt: "2026-08-28T04:00:00.000Z" });
        data = { item: clone(found) };
      } else if (itemMatch && method === "DELETE") {
        const id = decodeURIComponent(itemMatch[1]);
        state.pending = state.pending.filter((entry) => entry.id !== id);
        state.purchased = state.purchased.filter((entry) => entry.id !== id);
        data = { deleted: true };
      } else if (actionMatch && method === "POST") {
        const id = decodeURIComponent(actionMatch[1]);
        const action = actionMatch[2];
        const source = action === "purchase" ? state.pending : state.purchased;
        const destination = action === "purchase" ? state.purchased : state.pending;
        const index = source.findIndex((entry) => entry.id === id);
        if (index < 0) { status = 404; data = { error: { code: "NOT_FOUND", message: "not found" } }; }
        else {
          const [changed] = source.splice(index, 1);
          Object.assign(changed, action === "purchase" ? { status: "purchased", purchasedBy: { userId: user.id, displayName: user.displayName }, purchasedAt: "2026-08-28T02:00:00.000Z" } : { status: "pending", purchasedBy: null, purchasedAt: null });
          destination.push(changed);
          data = { item: clone(changed) };
          delay = options.mutationDelayMs ?? 0;
        }
      } else if (pathName === "/api/shopping/items/clear-purchased" && method === "POST") { state.purchased = []; data = { clearedCount: 1 }; }
      else { data = {}; }
    }
    const body = JSON.stringify(envelope(data));
    if (delay) await sleep(delay);
    event.respondedAt = Date.now();
    event.bytes = Buffer.byteLength(body);
    harness.responseBytes[pathName] ??= [];
    harness.responseBytes[pathName].push(event.bytes);
    await route.fulfill({ status, contentType: "application/json", body });
  });
  return harness;
};

const screenshot = async (page: Page, name: string, fullPage = false) => {
  await mkdir(artifactRoot, { recursive: true });
  await page.screenshot({ path: path.join(artifactRoot, name), fullPage });
};
const shoppingRow = (page: Page, name: string) => page.locator("[data-shopping-m4-id]").filter({ hasText: name });
const swipeLeft = async (page: Page, row: ReturnType<Page["locator"]>) => {
  const box = await row.boundingBox();
  if (!box) throw new Error("Shopping row is not measurable.");
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.35, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
};
const waitForList = async (page: Page, name = "牛乳（計測）") => {
  await expect(page.locator(".shopping-m4")).toBeVisible();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
};
const count = (harness: Harness, pathName: string, method = "GET") => harness.events.filter((event) => event.path === pathName && event.method === method).length;
const elapsed = (harness: Harness, pathName: string, method = "POST") => {
  const event = [...harness.events].reverse().find((entry) => entry.path === pathName && entry.method === method && entry.respondedAt);
  return event?.respondedAt && event.startedAt ? event.respondedAt - event.startedAt : null;
};

test.use({ viewport: { width: 390, height: 844 }, locale: "ja-JP", timezoneId: "Asia/Tokyo" });

test.describe("Shopping performance baseline diagnostics", () => {
  test("cold Shopping records request graph, bytes, and usable DOM", async ({ page }) => {
    const harness = await installApi(page);
    const coldStart = Date.now();
    await page.goto("/shopping");
    await waitForList(page);
    const coldUsableMs = Date.now() - coldStart;
    const initialListGets = count(harness, "/api/shopping/items");
    const initialTemplateGets = count(harness, "/api/shopping/templates");
    const initialMemberGets = count(harness, "/api/households/current/members");
    await screenshot(page, "01-pending-list-390x844.png");
    const row = shoppingRow(page, "牛乳（計測）");
    await row.getByRole("button", { name: "牛乳（計測）" }).click();
    await expect(row.locator(".shopping-m4__detail")).toBeVisible();
    await screenshot(page, "02-expanded-item-390x844.png");
    const purchaseUsableStart = Date.now();
    await row.getByRole("button", { name: "購入" }).click();
    await expect(page.getByRole("button", { name: /購入済み 1件/ })).toBeVisible();
    const purchaseUsableMs = Date.now() - purchaseUsableStart;
    await screenshot(page, "03-purchased-state-390x844.png");
    console.log("SHOPPING_PERF_COLD_COUNTS " + JSON.stringify(harness.events.reduce<Record<string, number>>((result, event) => { const key = `${event.method} ${event.path}`; result[key] = (result[key] ?? 0) + 1; return result; }, {})));
    expect(count(harness, "/api/auth/me")).toBeGreaterThanOrEqual(1);
    expect(count(harness, "/api/households/current")).toBeGreaterThanOrEqual(1);
    expect(count(harness, "/api/shopping/items")).toBe(initialListGets + 1);
    expect(count(harness, "/api/shopping/templates")).toBe(initialTemplateGets + 1);
    expect(count(harness, "/api/households/current/members")).toBe(initialMemberGets + 1);
    expect(harness.responseBytes["/api/shopping/items"]?.[0]).toBeGreaterThan(0);
    console.log("SHOPPING_PERF_COLD " + JSON.stringify({ coldUsableMs, purchaseUsableMs, requestCounts: { auth: count(harness, "/api/auth/me"), household: count(harness, "/api/households/current"), items: count(harness, "/api/shopping/items"), templates: count(harness, "/api/shopping/templates"), members: count(harness, "/api/households/current/members") }, logicalInitialRequestCounts: { auth: 1, household: 1, items: 1, templates: 1, members: 1 }, responseBytes: harness.responseBytes, items: { pending: 2, purchased: 0 } }));
  });

  test("Home to Shopping and Shopping revisit do not repeat shared bootstrap", async ({ page }) => {
    const harness = await installApi(page);
    await page.goto("/home");
    await expect(page.getByRole("heading", { name: "やること" })).toBeVisible();
    const homeToShoppingStart = Date.now();
    await page.getByRole("button", { name: "買い物", exact: true }).last().click();
    await waitForList(page);
    const homeToShoppingMs = Date.now() - homeToShoppingStart;
    const firstShoppingCounts = { items: count(harness, "/api/shopping/items"), templates: count(harness, "/api/shopping/templates"), members: count(harness, "/api/households/current/members") };
    const before = harness.events.length;
    const revisitStart = Date.now();
    await page.getByRole("button", { name: "ホーム", exact: true }).click();
    await expect(page.getByRole("heading", { name: "やること" })).toBeVisible();
    await page.getByRole("button", { name: "買い物", exact: true }).last().click();
    await waitForList(page);
    const revisitMs = Date.now() - revisitStart;
    const revisit = harness.events.slice(before);
    expect(revisit.filter((event) => event.path === "/api/auth/me")).toHaveLength(0);
    expect(revisit.filter((event) => event.path === "/api/households/current")).toHaveLength(0);
    expect(revisit.filter((event) => event.path === "/api/shopping/items")).toHaveLength(firstShoppingCounts.items);
    expect(revisit.filter((event) => event.path === "/api/shopping/templates")).toHaveLength(firstShoppingCounts.templates);
    expect(revisit.filter((event) => event.path === "/api/households/current/members")).toHaveLength(firstShoppingCounts.members);
    console.log("SHOPPING_PERF_NAV " + JSON.stringify({ homeToShoppingMs, revisitMs, totalCounts: { auth: count(harness, "/api/auth/me"), household: count(harness, "/api/households/current"), home: count(harness, "/api/home/today"), items: count(harness, "/api/shopping/items"), templates: count(harness, "/api/shopping/templates"), members: count(harness, "/api/households/current/members") }, firstShoppingCounts, revisitCounts: firstShoppingCounts }));
  });

  test("purchase, expanded purchase, and unpurchase use mutation plus full list refresh", async ({ page }) => {
    const harness = await installApi(page);
    await page.goto("/shopping");
    await waitForList(page);
    const initialListGets = count(harness, "/api/shopping/items");
    const row = shoppingRow(page, "牛乳（計測）");
    await row.getByRole("button", { name: "牛乳（計測）" }).click();
    await expect(row).toHaveClass(/is-expanded/);
    const purchaseStart = Date.now();
    await row.getByRole("button", { name: "購入" }).click();
    await expect(page.getByRole("button", { name: /購入済み 1件/ })).toBeVisible();
    const purchaseMs = Date.now() - purchaseStart;
    expect(await shoppingRow(page, "牛乳（計測）").locator(".shopping-m4__detail").count()).toBe(0);
    await page.getByRole("button", { name: /購入済み 1件/ }).click();
    const purchased = shoppingRow(page, "牛乳（計測）");
    await purchased.getByRole("button", { name: "牛乳（計測）" }).click();
    await swipeLeft(page, purchased);
    const unpurchaseStart = Date.now();
    await purchased.getByRole("button", { name: "戻す" }).click();
    await expect(page.getByRole("button", { name: /購入済み 0件/ })).toBeVisible();
    const unpurchaseMs = Date.now() - unpurchaseStart;
    expect(count(harness, "/api/shopping/items", "POST")).toBe(0);
    expect(count(harness, "/api/shopping/items/milk/purchase", "POST")).toBe(1);
    expect(count(harness, "/api/shopping/items/milk/unpurchase", "POST")).toBe(1);
    expect(count(harness, "/api/shopping/items")).toBe(initialListGets + 2);
    console.log("SHOPPING_PERF_MUTATIONS " + JSON.stringify({ purchase: { clickToVisibleMs: purchaseMs, post: 1, followupListGets: 3 }, unpurchase: { clickToVisibleMs: unpurchaseMs, post: 1, followupListGets: 3 }, mutationServerMs: elapsed(harness, "/api/shopping/items/milk/unpurchase") }));
  });

  test("100ms, 500ms, and 1500ms mutation delays keep the list usable but delay completion", async ({ browser }) => {
    const samples: Array<{ delayMs: number; mutationMs: number | null; pendingDuringDelay: boolean }> = [];
    for (const delayMs of [100, 500, 1500]) {
      const slowPage = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: "ja-JP", timezoneId: "Asia/Tokyo" });
      const harness = await installApi(slowPage, { mutationDelayMs: delayMs });
      await slowPage.goto("/shopping");
      await waitForList(slowPage);
      const row = shoppingRow(slowPage, "牛乳（計測）");
      await row.getByRole("button", { name: "牛乳（計測）" }).click();
      await row.getByRole("button", { name: "購入" }).click();
      await sleep(Math.min(80, delayMs / 2));
      const pendingDuringDelay = await row.isVisible();
      if (delayMs === 1500) await screenshot(slowPage, "04-slow-network-1500ms-390x844.png");
      await expect(slowPage.getByRole("button", { name: /購入済み 1件/ })).toBeVisible();
      samples.push({ delayMs, mutationMs: elapsed(harness, "/api/shopping/items/milk/purchase"), pendingDuringDelay });
      await slowPage.close();
    }
    expect(samples.every((sample) => sample.pendingDuringDelay)).toBe(true);
    console.log("SHOPPING_PERF_DELAY_SWEEP " + JSON.stringify(samples));
  });

  test("add, edit, delete, template/recent loading, and planned date propagation are measurable", async ({ page }) => {
    const harness = await installApi(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/shopping/new");
    await expect(page.locator("#shopping-name")).toBeVisible();
    expect(count(harness, "/api/shopping/recent")).toBeGreaterThanOrEqual(1);
    expect(count(harness, "/api/shopping/templates")).toBeGreaterThanOrEqual(1);
    await page.getByRole("button", { name: "以前の項目から選ぶ" }).click();
    await page.getByRole("button", { name: /牛乳（計測）/ }).click();
    await page.locator("#shopping-name").fill("日付付き買い物（計測）");
    await page.getByLabel("購入予定日").fill(plannedDate);
    const addStart = Date.now();
    await page.locator('form button[type="submit"]').click();
    await expect(page).toHaveURL(/\/shopping\?item=/);
    await expect(page.getByText("日付付き買い物（計測）", { exact: true })).toBeVisible();
    const addMs = Date.now() - addStart;
    await screenshot(page, "05-add-result-375x812.png");
    const created = harness.state.pending.find((entry) => entry.name === "日付付き買い物（計測）");
    expect(created?.plannedPurchaseDate).toBe(plannedDate);
    await page.goto(`/shopping/items/${created?.id}/edit`);
    await expect(page.locator("#shopping-name")).toHaveValue("日付付き買い物（計測）");
    await page.locator("#shopping-name").fill("編集済み買い物（計測）");
    const editStart = Date.now();
    await page.locator('form button[type="submit"]').click();
    await expect(page.getByText("編集済み買い物（計測）", { exact: true })).toBeVisible();
    const editMs = Date.now() - editStart;
    await screenshot(page, "06-edit-result-375x812.png");
    await page.goto("/calendar");
    await expect(page.locator(".calendar-month-grid")).toBeVisible();
    const plannedCell = page.locator('.calendar-day-cell[aria-label^="8月29日"]');
    await expect(plannedCell).toHaveAttribute("aria-label", /買い物1件/);
    await plannedCell.click();
    await expect(page.getByRole("heading", { name: "買うもの" })).toBeVisible();
    expect(count(harness, "/api/tasks/calendar/range")).toBeGreaterThan(0);
    expect(count(harness, "/api/tasks/calendar/day")).toBeGreaterThan(0);
    await page.goto(`/shopping/items/${created?.id}/edit`);
    await page.getByRole("button", { name: "削除" }).click();
    const deleteStart = Date.now();
    await page.getByRole("dialog").getByRole("button", { name: "削除する" }).click();
    await expect(page).toHaveURL(/\/shopping$/);
    await expect(page.getByText("編集済み買い物（計測）", { exact: true })).toHaveCount(0);
    const deleteMs = Date.now() - deleteStart;
    console.log("SHOPPING_PERF_WRITE " + JSON.stringify({ addMs, editMs, deleteMs, add: { post: count(harness, "/api/shopping/items", "POST"), followupListGets: 3 }, edit: { patch: count(harness, `/api/shopping/items/${created?.id}`, "PATCH"), followupListGets: 3 }, delete: { delete: count(harness, `/api/shopping/items/${created?.id}`, "DELETE"), followupListGets: 3 }, calendar: { rangeGets: count(harness, "/api/tasks/calendar/range"), dayGets: count(harness, "/api/tasks/calendar/day") }, responseBytes: harness.responseBytes }));
  });
});
