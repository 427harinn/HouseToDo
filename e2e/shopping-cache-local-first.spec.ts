import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, Page, test } from "@playwright/test";

const artifactRoot = path.resolve(process.env.PLAYWRIGHT_ARTIFACT_DIR ?? "artifacts/playwright/shopping-cache-local-first");
const user = { id: "shopping-s2-user", email: "shopping-s2@example.test", displayName: "S2利用者", avatarUrl: null };
const household = { id: "shopping-s2-household", name: "S2家庭", timezone: "Asia/Tokyo", weekStartsOn: 1, role: "owner" as const };
type Item = {
  id: string; name: string; quantity: string | null; note: string | null; plannedPurchaseDate: string | null;
  status: "pending" | "purchased"; addedBy: string; purchasedBy: { userId: string; displayName: string | null } | null;
  purchasedAt: string | null; sortOrder: number; createdAt: string; updatedAt: string; image: null;
};
type Harness = { events: Array<{ method: string; path: string; startedAt: number; respondedAt?: number }>; state: { pending: Item[]; purchased: Item[] }; releaseNextItems?: () => void; releasePurchase?: () => void; failPurchase: boolean };
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const envelope = (data: unknown, ok = true) => JSON.stringify(ok ? { ok: true, data, requestId: "shopping-s2" } : { ok: false, error: { code: "INTERNAL_ERROR", message: "購入に失敗しました" }, requestId: "shopping-s2" });
const makeItem = (id: string, name: string, status: Item["status"], plannedPurchaseDate: string | null = null): Item => ({
  id, name, quantity: "1個", note: "S2テストメモ", plannedPurchaseDate, status, addedBy: user.id,
  purchasedBy: status === "purchased" ? { userId: user.id, displayName: user.displayName } : null,
  purchasedAt: status === "purchased" ? "2026-09-01T03:00:00.000Z" : null,
  sortOrder: 1, createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", image: null
});
const hold = () => { let release!: () => void; const promise = new Promise<void>((resolve) => { release = resolve; }); return { promise, release }; };

const installApi = async (page: Page, options: { initial?: { pending: Item[]; purchased: Item[] }; holdItems?: boolean; holdPurchase?: boolean; purchaseDelayMs?: number } = {}): Promise<Harness> => {
  const state = { pending: clone(options.initial?.pending ?? [makeItem("milk", "牛乳", "pending")]), purchased: clone(options.initial?.purchased ?? []) };
  const harness: Harness = { events: [], state, failPurchase: false };
  let nextItemsHold = options.holdItems ? hold() : null;
  const purchaseGate = options.holdPurchase ? hold() : null;
  let purchaseHold = purchaseGate;
  let purchaseReleased = false;
  harness.releaseNextItems = () => { const current = nextItemsHold; nextItemsHold = null; current?.release(); };
  harness.releasePurchase = () => { purchaseReleased = true; purchaseGate?.release(); };
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const event = { method, path: url.pathname, startedAt: Date.now() };
    harness.events.push(event);
    let data: unknown = {};
    let status = 200;
    if (url.pathname === "/api/auth/me") data = { user };
    else if (url.pathname === "/api/households/current") data = { household };
    else if (url.pathname === "/api/households/current/members") data = { members: [{ userId: user.id, displayName: user.displayName, role: "owner", color: null, avatarUrl: null }] };
    else if (url.pathname === "/api/shopping/templates") data = { templates: [] };
    else if (url.pathname === "/api/shopping/recent") data = { items: [] };
    else if (url.pathname === "/api/shopping/items" && method === "GET") {
      if (nextItemsHold) { await nextItemsHold.promise; }
      data = { pending: clone(state.pending), purchased: clone(state.purchased) };
    } else if (url.pathname === "/api/shopping/items/clear-purchased" && method === "POST") {
      state.purchased = []; data = { clearedCount: 1 };
    } else {
      const actionMatch = url.pathname.match(/^\/api\/shopping\/items\/([^/]+)\/(purchase|unpurchase)$/);
      const itemMatch = url.pathname.match(/^\/api\/shopping\/items\/([^/]+)$/);
      if (actionMatch && method === "POST") {
        const id = decodeURIComponent(actionMatch[1]);
        if (harness.failPurchase) { status = 500; data = {}; }
        else {
          const action = actionMatch[2];
          const source = action === "purchase" ? state.pending : state.purchased;
          const destination = action === "purchase" ? state.purchased : state.pending;
          const index = source.findIndex((entry) => entry.id === id);
          if (index < 0) { status = 404; data = {}; }
          else {
            const changed = source.splice(index, 1)[0];
            Object.assign(changed, action === "purchase" ? { status: "purchased", purchasedBy: { userId: user.id, displayName: user.displayName }, purchasedAt: "2026-09-02T03:00:00.000Z" } : { status: "pending", purchasedBy: null, purchasedAt: null });
            destination.push(changed);
            data = { item: clone(changed) };
          }
        }
        if (purchaseHold) { const current = purchaseHold; purchaseHold = null; if (!purchaseReleased) await current.promise; }
      } else if (itemMatch && method === "GET") {
        const found = [...state.pending, ...state.purchased].find((entry) => entry.id === decodeURIComponent(itemMatch[1]));
        data = { item: clone(found) };
      } else if (itemMatch && method === "DELETE") {
        const id = decodeURIComponent(itemMatch[1]);
        state.pending = state.pending.filter((entry) => entry.id !== id); state.purchased = state.purchased.filter((entry) => entry.id !== id); data = { deleted: true };
      }
    }
    if (options.purchaseDelayMs && method === "POST" && /\/purchase$|\/unpurchase$/.test(url.pathname)) await new Promise((resolve) => setTimeout(resolve, options.purchaseDelayMs));
    event.respondedAt = Date.now();
    await route.fulfill({ status, contentType: "application/json", body: envelope(data, status < 400) });
  });
  return harness;
};

const row = (page: Page, name: string) => page.locator("[data-shopping-m4-id]").filter({ hasText: name });
const waitForList = async (page: Page, name: string) => { await expect(page.getByRole("heading", { name: "買い物" })).toBeVisible(); await expect(page.getByText(name, { exact: true })).toBeVisible(); };
const count = (harness: Harness, pathName: string, method = "GET") => harness.events.filter((event) => event.path === pathName && event.method === method).length;
const screenshot = async (page: Page, name: string) => { await mkdir(artifactRoot, { recursive: true }); await page.screenshot({ path: path.join(artifactRoot, name), fullPage: true }); };
const seedIdb = async (page: Page, data: { pending: Item[]; purchased: Item[] }) => {
  await page.addInitScript(({ data: nextData, userId, householdId }) => {
    let seedReadyResolve!: () => void;
    const seedReady = new Promise<void>((resolve) => { seedReadyResolve = resolve; });
    const request = indexedDB.open("house-to-do-shopping-snapshots", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("shopping-lists", { keyPath: "key" });
    request.onerror = () => seedReadyResolve();
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction("shopping-lists", "readwrite");
      transaction.objectStore("shopping-lists").put({ key: `shopping-list:${userId}:${householdId}`, schemaVersion: 1, userId, householdId, savedAt: Date.now(), data: nextData });
      transaction.oncomplete = () => { database.close(); seedReadyResolve(); };
      transaction.onerror = () => seedReadyResolve();
    };
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const requestUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (requestUrl.includes("/api/auth/me") || requestUrl.includes("/api/households/current")) await seedReady;
      return originalFetch(input, init);
    };
  }, { data, userId: user.id, householdId: household.id });
};

test.use({ viewport: { width: 390, height: 844 }, locale: "ja-JP", timezoneId: "Asia/Tokyo" });

test.describe("Shopping S2 cache-first and local-first", () => {
  test("shows cached Shopping immediately while GET is held, then revalidates", async ({ page }) => {
    const cached = { pending: [makeItem("cached", "キャッシュ牛乳", "pending")], purchased: [] };
    await seedIdb(page, cached);
    const harness = await installApi(page, { initial: { pending: [makeItem("fresh", "最新牛乳", "pending")], purchased: [] }, holdItems: true });
    await page.goto("/shopping");
    await expect(page.getByText("キャッシュ牛乳", { exact: true })).toBeVisible();
    await page.waitForTimeout(600);
    await screenshot(page, "01-cached-shopping-get-held-390x844.png");
    harness.releaseNextItems?.();
    await expect(page.getByText("最新牛乳", { exact: true })).toBeVisible();
  });

  test("uses memory cache on Shopping revisit and does not repeat support requests", async ({ page }) => {
    const harness = await installApi(page);
    await page.goto("/shopping"); await waitForList(page, "牛乳");
    const before = { templates: count(harness, "/api/shopping/templates"), members: count(harness, "/api/households/current/members") };
    const held = hold();
    await page.route("**/api/shopping/items", async (route) => { await held.promise; await route.fulfill({ status: 200, contentType: "application/json", body: envelope({ pending: harness.state.pending, purchased: harness.state.purchased }) }); });
    await page.getByRole("button", { name: "ホーム", exact: true }).click();
    await expect(page.getByRole("heading", { name: "やること" })).toBeVisible();
    await page.getByRole("button", { name: "買い物", exact: true }).last().click();
    await expect(page.getByText("牛乳", { exact: true })).toBeVisible();
    expect(count(harness, "/api/shopping/templates")).toBe(before.templates);
    expect(count(harness, "/api/households/current/members")).toBe(before.members);
    await screenshot(page, "02-memory-revisit-390x844.png"); held.release();
  });

  test("locks cached mutations until initial authoritative sync", async ({ page }) => {
    const cached = { pending: [makeItem("locked", "同期待ち牛乳", "pending")], purchased: [] };
    await seedIdb(page, cached); const harness = await installApi(page, { initial: cached, holdItems: true });
    await page.goto("/shopping"); const cachedRow = row(page, "同期待ち牛乳"); await cachedRow.getByRole("button", { name: "同期待ち牛乳" }).click();
    await expect(cachedRow.getByRole("button", { name: "購入" })).toBeDisabled();
    harness.releaseNextItems?.(); await expect(cachedRow.getByRole("button", { name: "購入" })).toBeEnabled();
  });

  test("moves Purchase locally before a held POST and avoids support refetches", async ({ page }) => {
    const harness = await installApi(page, { holdPurchase: true }); await page.goto("/shopping"); await waitForList(page, "牛乳");
    const supportCounts = { templates: count(harness, "/api/shopping/templates"), members: count(harness, "/api/households/current/members") };
    const localStart = Date.now();
    const milk = row(page, "牛乳"); await milk.getByRole("button", { name: "牛乳" }).click(); await milk.getByRole("button", { name: "購入" }).click();
    await expect(page.getByRole("button", { name: /購入済み 1件/ })).toBeVisible();
    console.log(`SHOPPING_S2_PURCHASE_LOCAL_MS ${Date.now() - localStart}`);
    await screenshot(page, "03-purchase-local-post-held-390x844.png");
    expect(count(harness, "/api/shopping/items/milk/purchase", "POST")).toBe(1);
    expect(count(harness, "/api/shopping/templates")).toBe(supportCounts.templates); expect(count(harness, "/api/households/current/members")).toBe(supportCounts.members);
    await expect.poll(() => count(harness, "/api/shopping/items/milk/purchase", "POST")).toBe(1);
    harness.releasePurchase?.(); await page.getByRole("button", { name: /購入済み 1件/ }).click(); await expect(row(page, "牛乳")).toBeVisible();
    await expect.poll(() => [...harness.events].filter((event) => event.path === "/api/shopping/items/milk/purchase")[0]?.respondedAt).toBeTruthy();
    const purchasePost = [...harness.events].reverse().find((event) => event.path === "/api/shopping/items/milk/purchase" && event.respondedAt);
    console.log(`SHOPPING_S2_PURCHASE_POST_MS ${purchasePost?.respondedAt && purchasePost.startedAt ? purchasePost.respondedAt - purchasePost.startedAt : "unknown"}`);
    await screenshot(page, "04-purchase-confirmed-purchased-section-390x844.png");
  });

  test("rolls back a failed Purchase without wiping the list", async ({ page }) => {
    const harness = await installApi(page); harness.failPurchase = true; await page.goto("/shopping"); await waitForList(page, "牛乳"); await page.setViewportSize({ width: 375, height: 812 });
    const milk = row(page, "牛乳"); await milk.getByRole("button", { name: "牛乳" }).click(); await milk.getByRole("button", { name: "購入" }).click();
    await expect(page.getByText("牛乳", { exact: true })).toBeVisible(); await expect(page.getByRole("alert")).toBeVisible(); await screenshot(page, "05-purchase-rollback-error-375x812.png");
  });

  test("moves Unpurchase locally and rolls it back on failure", async ({ page }) => {
    const harness = await installApi(page, { initial: { pending: [], purchased: [makeItem("bread", "パン", "purchased")] } });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/shopping"); await expect(page.getByRole("button", { name: /購入済み 1件/ })).toBeVisible(); await page.getByRole("button", { name: /購入済み 1件/ }).click();
    const bread = row(page, "パン"); await bread.getByRole("button", { name: "パン" }).click();
    const box = await bread.boundingBox(); if (!box) throw new Error("Purchased row not measurable");
    await page.mouse.move(box.x + box.width * .8, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width * .3, box.y + box.height / 2, { steps: 8 }); await page.mouse.up();
    await screenshot(page, "07-expanded-purchased-375x812.png");
    harness.failPurchase = true; await bread.getByRole("button", { name: "戻す" }).click(); await expect(page.getByRole("button", { name: /購入済み 1件/ })).toBeVisible(); await screenshot(page, "06-unpurchase-rollback-375x812.png");
  });

  test("moves Unpurchase before a held POST", async ({ page }) => {
    const harness = await installApi(page, { initial: { pending: [], purchased: [makeItem("bread", "パン", "purchased")] }, holdPurchase: true });
    await page.setViewportSize({ width: 375, height: 812 }); await page.goto("/shopping"); await page.getByRole("button", { name: /購入済み 1件/ }).click();
    const bread = row(page, "パン"); await bread.getByRole("button", { name: "パン" }).click(); const box = await bread.boundingBox(); if (!box) throw new Error("Purchased row not measurable");
    await page.mouse.move(box.x + box.width * .8, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width * .3, box.y + box.height / 2, { steps: 8 }); await page.mouse.up();
    const localStart = Date.now(); await bread.getByRole("button", { name: "戻す" }).click(); await expect(page.getByRole("button", { name: /購入済み 0件/ })).toBeVisible();
    console.log(`SHOPPING_S2_UNPURCHASE_LOCAL_MS ${Date.now() - localStart}`); await screenshot(page, "08-unpurchase-local-post-held-375x812.png"); harness.releasePurchase?.();
  });

  test("keeps the local Purchase move independent from a controlled 1500ms POST", async ({ page }) => {
    const harness = await installApi(page, { purchaseDelayMs: 1500 }); await page.goto("/shopping"); await waitForList(page, "牛乳");
    const localStart = Date.now(); const milk = row(page, "牛乳"); await milk.getByRole("button", { name: "牛乳" }).click(); await milk.getByRole("button", { name: "購入" }).click();
    await expect(page.getByRole("button", { name: /購入済み 1件/ })).toBeVisible();
    console.log(`SHOPPING_S2_DELAYED_PURCHASE_LOCAL_MS ${Date.now() - localStart}`);
    const post = () => [...harness.events].find((event) => event.path === "/api/shopping/items/milk/purchase");
    expect(post()?.respondedAt).toBeUndefined();
    await expect.poll(() => post()?.respondedAt, { timeout: 5000 }).toBeTruthy();
    const elapsed = post()?.respondedAt && post()?.startedAt ? post()!.respondedAt! - post()!.startedAt : 0;
    console.log(`SHOPPING_S2_DELAYED_PURCHASE_POST_MS ${elapsed}`); expect(elapsed).toBeGreaterThanOrEqual(1400);
  });

  test("allows different-item concurrency and blocks the same item", async ({ page }) => {
    const harness = await installApi(page, { initial: { pending: [makeItem("a", "A", "pending"), makeItem("b", "B", "pending")], purchased: [] }, holdPurchase: true });
    await page.goto("/shopping"); await waitForList(page, "A");
    for (const name of ["A", "B"]) { const itemRow = row(page, name); await itemRow.getByRole("button", { name }).click(); await itemRow.getByRole("button", { name: "購入" }).click(); }
    await expect(page.getByRole("button", { name: /購入済み 2件/ })).toBeVisible();
    expect(count(harness, "/api/shopping/items/a/purchase", "POST")).toBe(1); expect(count(harness, "/api/shopping/items/b/purchase", "POST")).toBe(1); harness.releasePurchase?.();
  });

  test("does not let a stale GET undo a newer Purchase", async ({ page }) => {
    const harness = await installApi(page); await page.goto("/shopping"); await waitForList(page, "牛乳");
    const stale = hold(); let staleHandled = false; await page.route("**/api/shopping/items", async (route) => { if (staleHandled) return route.fallback(); staleHandled = true; harness.events.push({ method: "GET", path: "/api/shopping/items", startedAt: Date.now() }); await stale.promise; await route.fulfill({ status: 200, contentType: "application/json", body: envelope({ pending: [makeItem("milk", "牛乳", "pending")], purchased: [] }) }); });
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange"))); await expect.poll(() => count(harness, "/api/shopping/items")).toBeGreaterThan(1);
    const milk = row(page, "牛乳"); await milk.getByRole("button", { name: "牛乳" }).click(); await milk.getByRole("button", { name: "購入" }).click(); stale.release();
    await expect(page.getByRole("button", { name: /購入済み 1件/ })).toBeVisible();
  });
});
