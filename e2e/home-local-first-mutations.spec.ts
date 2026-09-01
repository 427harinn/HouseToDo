import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

const evidenceDir = path.resolve("artifacts/playwright/home-local-first-mutations");
const user = { id: "user-1", email: "wp5@example.test", displayName: "WP5利用者", avatarUrl: null };
const household = { id: "household-1", name: "WP5家庭", timezone: "Asia/Tokyo", weekStartsOn: 1, role: "owner" as const };
const today = new Intl.DateTimeFormat("en-CA", { timeZone: household.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

type Action = "complete" | "skip" | "restore";
type TaskFixture = ReturnType<typeof makeTask>;

const makeTask = (id: string, title: string): {
  id: string; title: string; description: string; recurrenceType: "daily"; modelRecurrenceType: "daily"; assignmentType: "anyone"; assignedUserId: null;
  assignment: { type: "anyone"; user: null }; scheduledTime: null; notificationSlot: "none"; weekdays: number[]; weeklyTargetCount: null;
  active: true; sortOrder: number; createdBy: string; createdAt: string; updatedAt: string; status: "pending"; actedBy: null;
  startedAt: null; completedAt: null; skippedAt: null; note: null; targetDate: string; deadlineDate: string; deadlineTime: null;
  scopeKind: "occurrence"; occurrenceKey: string; periodKey: null; periodStart: null; periodEnd: null;
} => ({
  id, title, description: `${title}のメモ`, recurrenceType: "daily", modelRecurrenceType: "daily", assignmentType: "anyone", assignedUserId: null,
  assignment: { type: "anyone", user: null }, scheduledTime: null, notificationSlot: "none", weekdays: [], weeklyTargetCount: null,
  active: true, sortOrder: 0, createdBy: user.id, createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z",
  status: "pending", actedBy: null, startedAt: null, completedAt: null, skippedAt: null, note: null, targetDate: today, deadlineDate: today,
  deadlineTime: null, scopeKind: "occurrence", occurrenceKey: `${id}:${today}`, periodKey: null, periodStart: null, periodEnd: null
});

const makeRecord = (task: TaskFixture, status: "completed" | "skipped", id: string) => ({
  id, taskId: task.id, status, title: task.title, taskActive: true,
  actualCompleter: { userId: user.id, displayName: user.displayName, avatarUrl: null }, assignedUser: null,
  completedAt: status === "completed" ? "2026-09-01T02:00:00.000Z" : null,
  skippedAt: status === "skipped" ? "2026-09-01T02:00:00.000Z" : null, targetDate: today, targetWeekStart: null,
  occurrenceKey: task.occurrenceKey, periodKey: null, createdAt: "2026-09-01T02:00:00.000Z", updatedAt: "2026-09-01T02:00:00.000Z"
});

const makeHome = (homeTasks: TaskFixture[], completedRecords = [], passedRecords = []) => ({
  date: today, homeTasks, completedRecords, passedRecords, shopping: { pendingCount: 1 }, members: []
});

const envelope = (data: unknown, status = 200) => ({
  status, contentType: "application/json",
  body: JSON.stringify(status >= 400
    ? { ok: false, error: { code: status === 409 ? "CONFLICT" : "INTERNAL_ERROR", message: status === 409 ? "競合しました" : "取得に失敗しました" }, requestId: "wp5" }
    : { ok: true, data, requestId: "wp5" })
});

const deferred = () => {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
};

type Harness = {
  postCount: () => number;
  homeCount: () => number;
  releasePost: (taskId?: string) => void;
  releaseGet: () => void;
  holdNextGet: () => void;
  serverHome: () => ReturnType<typeof makeHome>;
};

const installRoutes = async (page: Page, options: { initial: ReturnType<typeof makeHome>; holdInitialGet?: boolean; holdPost?: boolean; failPost?: boolean; failGetCount?: number; restoreTask?: TaskFixture }) => {
  let serverHome = structuredClone(options.initial);
  let homeCalls = 0;
  let postCalls = 0;
  let failedGets = 0;
  let initialGetReleased = !options.holdInitialGet;
  const initialGetGate = options.holdInitialGet ? deferred() : null;
  let nextGetGate: ReturnType<typeof deferred> | null = null;
  const postGates = new Map<string, ReturnType<typeof deferred>>();
  const pendingPost = (taskId: string) => {
    const gate = deferred();
    postGates.set(taskId, gate);
    return gate;
  };
  const applyServerAction = (taskId: string, action: Action) => {
    const task = serverHome.homeTasks.find((entry) => entry.id === taskId);
    if (action === "restore") {
      const restored = options.restoreTask;
      serverHome = {
        ...serverHome,
        homeTasks: restored ? [...serverHome.homeTasks, structuredClone(restored)] : serverHome.homeTasks,
        completedRecords: serverHome.completedRecords.filter((record) => record.taskId !== taskId),
        passedRecords: serverHome.passedRecords.filter((record) => record.taskId !== taskId)
      };
      return;
    }
    if (!task) return;
    serverHome = {
      ...serverHome,
      homeTasks: serverHome.homeTasks.filter((entry) => entry.id !== taskId),
      completedRecords: action === "complete" ? [...serverHome.completedRecords, makeRecord(task, "completed", `server-${taskId}`)] : serverHome.completedRecords,
      passedRecords: action === "skip" ? [...serverHome.passedRecords, makeRecord(task, "skipped", `server-${taskId}`)] : serverHome.passedRecords
    };
  };
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/auth/me") return route.fulfill(envelope({ user }));
    if (url.pathname === "/api/households/current") return route.fulfill(envelope({ household }));
    if (url.pathname === "/api/households/current/image-usage") return route.fulfill(envelope({ activeCount: 0, activeBytes: 0, reservedCount: 0, reservedBytes: 0, pendingCleanupBytes: 0, pendingCleanupUnknownCount: 0, storedBytes: 0, storedBytesKnown: true, activeCountLimit: 50, activeBytesLimit: 52428800, storedBytesLimit: 78643200, dailyUploadLimit: 20 }));
    if (url.pathname === "/api/home/today") {
      homeCalls += 1;
      const responseHome = structuredClone(serverHome);
      if (!initialGetReleased && initialGetGate) {
        await initialGetGate.promise;
      }
      if (nextGetGate) {
        const gate = nextGetGate;
        nextGetGate = null;
        await gate.promise;
      }
      if (postCalls > 0 && failedGets < (options.failGetCount ?? 0)) {
        failedGets += 1;
        return route.fulfill(envelope({}, 503));
      }
      return route.fulfill(envelope(responseHome));
    }
    const actionMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/(complete|skip|restore)$/);
    if (actionMatch && request.method() === "POST") {
      const [, taskId, action] = actionMatch as [string, string, Action];
      postCalls += 1;
      if (options.holdPost) await (postGates.get(taskId) ?? pendingPost(taskId)).promise;
      if (options.failPost) return route.fulfill(envelope({}, 500));
      applyServerAction(taskId, action);
      return route.fulfill(envelope({ result: action === "restore" ? { reset: true } : { status: action === "skip" ? "skipped" : "completed" } }));
    }
    return route.fulfill(envelope({}));
  });
  return {
    postCount: () => postCalls,
    homeCount: () => homeCalls,
    releasePost: (taskId?: string) => { if (taskId) postGates.get(taskId)?.release(); else postGates.forEach((gate) => gate.release()); },
    releaseGet: () => { initialGetReleased = true; initialGetGate?.release(); nextGetGate?.release(); nextGetGate = null; },
    holdNextGet: () => { nextGetGate = deferred(); },
    serverHome: () => serverHome
  } satisfies Harness;
};

const openTask = async (page: Page, title: string) => {
  const row = page.locator(".m2-home__task-list .m2-home__row").filter({ hasText: title });
  await row.locator(".m2-home__row-main").click();
  return row;
};

const openHistory = async (page: Page, label: RegExp) => {
  await page.getByRole("button", { name: label }).click();
  const row = page.locator(".m2-home__history-list .m2-home__row").first();
  await swipeOpen(page, row);
  return row;
};

const swipeOpen = async (page: Page, row: ReturnType<Page["locator"]>) => {
  const box = await row.boundingBox();
  if (!box) throw new Error("Home row is not measurable.");
  await page.mouse.move(box.x + 190, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + 70, box.y + 30, { steps: 6 });
  await page.mouse.up();
  await expect(row).toHaveClass(/is-actions-open/);
};

const seedSnapshot = async (page: Page, data: ReturnType<typeof makeHome>) => {
  await page.addInitScript(({ data: nextData, identity }) => {
    const key = `home:${identity.userId}:${identity.householdId}:${nextData.date}`;
    const request = indexedDB.open("house-to-do-home-snapshots", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("home-snapshots", { keyPath: "key" });
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction("home-snapshots", "readwrite");
      transaction.objectStore("home-snapshots").put({ key, schemaVersion: 1, ...identity, date: nextData.date, savedAt: Date.now(), data: nextData });
      transaction.oncomplete = () => database.close();
    };
  }, { data, identity: { userId: user.id, householdId: household.id } });
};

test.use({ viewport: { width: 390, height: 844 }, locale: "ja-JP", timezoneId: "Asia/Tokyo" });

test.describe("WP5 Home local-first mutations", () => {
  test("complete moves at the motion boundary while POST is unresolved", async ({ page }) => {
    const task = makeTask("task-complete", "すぐ完了");
    const harness = await installRoutes(page, { initial: makeHome([task]), holdPost: true });
    await page.goto("/home");
    await expect(page.getByText(task.title, { exact: true })).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, "01-home-normal-390x844.png"), fullPage: false });
    const row = await openTask(page, task.title);
    const clickAt = Date.now();
    await row.getByRole("button", { name: "完了", exact: true }).click();
    await expect.poll(() => harness.postCount()).toBe(1);
    await expect(page.getByRole("button", { name: /完了済み 1/ })).toBeVisible({ timeout: 1000 });
    await page.getByRole("button", { name: /完了済み 1/ }).click();
    await expect(page.getByRole("button", { name: task.title })).toHaveCount(0);
    await expect(page.getByText(task.title, { exact: true })).toBeVisible();
    expect(Date.now() - clickAt).toBeLessThan(900);
    await page.waitForTimeout(220);
    await page.screenshot({ path: path.join(evidenceDir, "02-complete-local-transient-390x844.png"), fullPage: false });
    harness.releasePost(task.id);
  });

  test("complete keeps the transient record while the post-mutation GET is held", async ({ page }) => {
    const task = makeTask("task-get", "GET待ち完了");
    const harness = await installRoutes(page, { initial: makeHome([task]) });
    await page.goto("/home");
    await expect(page.getByText(task.title)).toBeVisible();
    harness.holdNextGet();
    const row = await openTask(page, task.title);
    await row.getByRole("button", { name: "完了", exact: true }).click();
    await expect.poll(() => harness.postCount()).toBe(1);
    await expect(page.getByRole("button", { name: /完了済み 1/ })).toBeVisible();
    await page.getByRole("button", { name: /完了済み 1/ }).click();
    await expect(page.getByText(task.title)).toBeVisible();
    harness.releaseGet();
    await expect(page.getByText(task.title)).toBeVisible();
  });

  test("pass moves at the motion boundary while network is slow", async ({ page }) => {
    const task = makeTask("task-pass", "すぐパス");
    const harness = await installRoutes(page, { initial: makeHome([task]), holdPost: true });
    await page.goto("/home");
    const row = await openTask(page, task.title);
    await swipeOpen(page, row);
    await row.locator(".m2-home__actions .is-secondary").click();
    await expect.poll(() => harness.postCount()).toBe(1);
    await expect(page.getByRole("button", { name: /パス済み 1/ })).toBeVisible();
    await expect(page.getByText(task.title)).toBeVisible();
    await page.getByRole("button", { name: /パス済み 1/ }).click();
    await expect(page.getByText(task.title, { exact: true })).toBeVisible();
    await page.waitForTimeout(220);
    await page.screenshot({ path: path.join(evidenceDir, "03-pass-local-transient-390x844.png"), fullPage: false });
    harness.releasePost(task.id);
  });

  test("restores a current-session completion with the retained full task projection", async ({ page }) => {
    const task = makeTask("task-restore-current", "戻せる完了");
    const harness = await installRoutes(page, { initial: makeHome([task]), restoreTask: task });
    await page.goto("/home");
    const activeRow = await openTask(page, task.title);
    await activeRow.getByRole("button", { name: "完了", exact: true }).click();
    await expect(page.getByRole("button", { name: /完了済み 1/ })).toBeVisible();
    const historyRow = await openHistory(page, /完了済み 1/);
    await expect(historyRow.getByRole("button", { name: "戻す" })).toBeEnabled();
    await historyRow.getByRole("button", { name: "戻す" }).click({ force: true });
    await expect(page.getByRole("button", { name: `${task.title}の詳細` })).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, "04-restore-current-session-390x844.png"), fullPage: false });
    expect(harness.postCount()).toBe(2);
  });

  test("old history restore removes history locally without fabricating an active task", async ({ page }) => {
    const task = makeTask("task-old-history", "以前の履歴");
    const harness = await installRoutes(page, { initial: makeHome([], [makeRecord(task, "completed", "old-record")]) });
    await page.goto("/home");
    const historyRow = await openHistory(page, /完了済み 1/);
    await historyRow.getByRole("button", { name: "戻す" }).click({ force: true });
    await expect(page.getByRole("button", { name: /完了済み/ })).toHaveCount(0);
    await expect(page.getByText("やることはありません")).toBeVisible();
    expect(harness.postCount()).toBe(1);
  });

  test("POST failure rolls back a completed local transition and shows the error", async ({ page }) => {
    const task = makeTask("task-fail", "失敗する完了");
    const harness = await installRoutes(page, { initial: makeHome([task]), failPost: true, holdPost: true });
    await page.goto("/home");
    const row = await openTask(page, task.title);
    await row.getByRole("button", { name: "完了", exact: true }).click();
    await expect(page.getByRole("button", { name: /完了済み 1/ })).toBeVisible();
    harness.releasePost(task.id);
    await expect(page.getByRole("button", { name: `${task.title}の詳細` })).toBeVisible();
    await expect(page.getByText("取得に失敗しました")).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, "05-post-failure-rollback-390x844.png"), fullPage: false });
    expect(harness.postCount()).toBe(1);
  });

  test("POST success and GET failure retain the local committed state until a later refresh", async ({ page }) => {
    const task = makeTask("task-get-fail", "GET失敗でも保持");
    const harness = await installRoutes(page, { initial: makeHome([task]), failGetCount: 1 });
    await page.goto("/home");
    const row = await openTask(page, task.title);
    await row.getByRole("button", { name: "完了", exact: true }).click();
    await expect(page.getByRole("button", { name: /完了済み 1/ })).toBeVisible();
    await page.getByRole("button", { name: /完了済み 1/ }).click();
    await expect(page.getByText("最新情報を取得できませんでした。")).toBeVisible();
    await page.waitForTimeout(220);
    await page.screenshot({ path: path.join(evidenceDir, "06-get-failure-retained-390x844.png"), fullPage: false });
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect.poll(() => harness.homeCount()).toBeGreaterThan(1);
    await expect(page.getByText(task.title)).toBeVisible();
  });

  test("duplicate same-task taps create one POST", async ({ page }) => {
    const task = makeTask("task-duplicate", "連打防止");
    const harness = await installRoutes(page, { initial: makeHome([task]), holdPost: true });
    await page.goto("/home");
    const row = await openTask(page, task.title);
    const complete = row.getByRole("button", { name: "完了", exact: true });
    await complete.evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
    await expect.poll(() => harness.postCount()).toBe(1);
    harness.releasePost(task.id);
  });

  test("different tasks remain operable concurrently and reconcile independently", async ({ page }) => {
    const first = makeTask("task-a", "家事A");
    const second = makeTask("task-b", "家事B");
    const harness = await installRoutes(page, { initial: makeHome([first, second]), holdPost: true });
    await page.goto("/home");
    const firstRow = await openTask(page, first.title);
    await firstRow.getByRole("button", { name: "完了", exact: true }).click();
    const secondRow = await openTask(page, second.title);
    await swipeOpen(page, secondRow);
    await secondRow.locator(".m2-home__actions .is-secondary").click();
    await expect.poll(() => harness.postCount()).toBe(2);
    await expect(page.getByRole("button", { name: /完了済み 1/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /パス済み 1/ })).toBeVisible();
    harness.releasePost(second.id);
    harness.releasePost(first.id);
  });

  test("a refresh started before Complete cannot restore the task after mutation", async ({ page }) => {
    const task = makeTask("task-stale", "古い更新対象");
    const harness = await installRoutes(page, { initial: makeHome([task]) });
    await page.goto("/home");
    await expect(page.getByText(task.title, { exact: true })).toBeVisible();
    harness.holdNextGet();
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect.poll(() => harness.homeCount()).toBe(2);
    const row = await openTask(page, task.title);
    await row.getByRole("button", { name: "完了", exact: true }).click();
    harness.releaseGet();
    await expect(page.getByRole("button", { name: /完了済み 1/ })).toBeVisible();
    await expect(page.getByRole("button", { name: `${task.title}の詳細` })).toHaveCount(0);
  });

  test("optimistic Home data never enters IndexedDB, while authoritative data does", async ({ page }) => {
    const task = makeTask("task-cache", "キャッシュ安全");
    const initial = makeHome([task]);
    await seedSnapshot(page, initial);
    const harness = await installRoutes(page, { initial, holdInitialGet: true, holdPost: true });
    await page.goto("/home");
    await expect(page.getByText(task.title)).toBeVisible();
    const cachedBefore = await page.evaluate(async () => new Promise<unknown>((resolve) => {
      const request = indexedDB.open("house-to-do-home-snapshots", 1);
      request.onsuccess = () => { const get = request.result.transaction("home-snapshots").objectStore("home-snapshots").get("home:user-1:household-1:" + new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date())); get.onsuccess = () => resolve(get.result); };
    }));
    expect(JSON.stringify(cachedBefore)).not.toContain("local-complete");
    harness.releaseGet();
    await expect(page.getByText(task.title)).toBeVisible();
    const row = await openTask(page, task.title);
    await row.getByRole("button", { name: "完了", exact: true }).click();
    await expect(page.getByRole("button", { name: /完了済み 1/ })).toBeVisible();
    const readCache = () => page.evaluate(async () => new Promise<unknown>((resolve) => {
      const request = indexedDB.open("house-to-do-home-snapshots", 1);
      request.onsuccess = () => { const get = request.result.transaction("home-snapshots").objectStore("home-snapshots").get("home:user-1:household-1:" + new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date())); get.onsuccess = () => resolve(get.result); };
    }));
    const cachedDuring = await readCache();
    expect(JSON.stringify(cachedDuring)).not.toContain("local-complete");
    harness.releasePost(task.id);
    await expect.poll(async () => JSON.stringify(await readCache())).toContain("server-task-cache");
  });

  test("initial cached Home keeps Complete disabled until first authoritative sync", async ({ page }) => {
    const task = makeTask("task-lock", "初回同期ロック");
    const initial = makeHome([task]);
    await seedSnapshot(page, initial);
    const harness = await installRoutes(page, { initial, holdInitialGet: true });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/home");
    await expect(page.getByText(task.title, { exact: true })).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, "01-home-normal-375x812.png"), fullPage: false });
    const row = await openTask(page, task.title);
    await expect(row.getByRole("button", { name: "完了", exact: true })).toBeDisabled();
    harness.releaseGet();
    await expect(row.getByRole("button", { name: "完了", exact: true })).toBeEnabled();
  });
});
