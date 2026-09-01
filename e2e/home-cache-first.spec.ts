import { expect, Page, test } from "@playwright/test";
import path from "node:path";

const artifactRoot = path.resolve(process.env.PLAYWRIGHT_ARTIFACT_DIR ?? "artifacts/playwright/home-cache-first");
const user = { id: "user-1", email: "home-cache@example.test", displayName: "ホーム利用者" };
const household = { id: "household-1", name: "キャッシュ家庭", timezone: "Asia/Tokyo", weekStartsOn: 1, role: "owner" as const };

const today = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: household.timezone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
}).format(new Date());

const homeData = (title: string, date = today()) => ({
  date,
  homeTasks: [{
    id: `task-${title}`,
    title,
    recurrenceType: "daily",
    modelRecurrenceType: "daily",
    assignmentType: "anyone",
    assignedUserId: null,
    description: "キャッシュ検証",
    deadlineDate: date,
    deadlineTime: null,
    scheduledTime: null,
    status: "pending",
    overdue: false,
    targetDate: date
  }],
  completedRecords: [],
  passedRecords: [],
  shopping: { pendingCount: 0 },
  members: []
});

const envelope = (data: unknown, status = 200) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify(status >= 400
    ? { ok: false, error: { code: "INTERNAL_ERROR", message: "refresh failed" }, requestId: "e2e" }
    : { ok: true, data, requestId: "e2e" })
});

const unauthenticated = () => ({
  status: 401,
  contentType: "application/json",
  body: JSON.stringify({ ok: false, error: { code: "UNAUTHENTICATED", message: "ログインが必要です" }, requestId: "e2e" })
});

const seedSnapshot = async (page: Page, identity: { userId: string; householdId: string; date: string }, data: ReturnType<typeof homeData>) => {
  await page.addInitScript(({ identity: nextIdentity, data: nextData }) => {
    const key = `home:${nextIdentity.userId}:${nextIdentity.householdId}:${nextIdentity.date}`;
    const request = indexedDB.open("house-to-do-home-snapshots", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("home-snapshots", { keyPath: "key" });
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction("home-snapshots", "readwrite");
      transaction.objectStore("home-snapshots").put({ key, schemaVersion: 1, ...nextIdentity, savedAt: Date.now(), data: nextData });
      transaction.oncomplete = () => database.close();
    };
  }, { identity, data });
};

const installBasicRoutes = async (page: Page, options: {
  home: (count: number) => Promise<ReturnType<typeof envelope>> | ReturnType<typeof envelope>;
  auth?: ReturnType<typeof envelope>;
  currentHousehold?: ReturnType<typeof envelope>;
  onHome?: (count: number) => void;
}) => {
  let homeCalls = 0;
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/auth/me") return route.fulfill(options.auth ?? envelope({ user }));
    if (url.pathname === "/api/households/current") return route.fulfill(options.currentHousehold ?? envelope({ household }));
    if (url.pathname === "/api/home/today") {
      homeCalls += 1;
      options.onHome?.(homeCalls);
      return route.fulfill(await options.home(homeCalls));
    }
    if (url.pathname === "/api/tasks/calendar") return route.fulfill(envelope({
      from: today(), to: today(), today: today(), timezone: household.timezone, dates: {}, selected: null
    }));
    return route.fulfill(envelope({}));
  });
  return { homeCalls: () => homeCalls };
};

test.describe("WP4 Home cache-first bootstrap", () => {
  test("starts auth, household, and Home requests in parallel and makes one cold Home GET", async ({ page }) => {
    const starts: string[] = [];
    const startTimes: number[] = [];
    const releases = new Map<string, () => void>();
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      if (!url.pathname.startsWith("/api/")) return route.continue();
      const pathname = url.pathname;
      if (!["/api/auth/me", "/api/households/current", "/api/home/today"].includes(pathname)) return route.fulfill(envelope({}));
      starts.push(pathname);
      startTimes.push(Date.now());
      await new Promise<void>((resolve) => releases.set(pathname, resolve));
      if (pathname === "/api/auth/me") return route.fulfill(envelope({ user }));
      if (pathname === "/api/households/current") return route.fulfill(envelope({ household }));
      return route.fulfill(envelope(homeData("並列起動")));
    });

    const navigation = page.goto("/home");
    await expect.poll(() => new Set(starts).size).toBe(3);
    console.log(`[WP4 timing][controlled preview] request-start overlap=${Math.max(...startTimes) - Math.min(...startTimes)}ms`);
    expect(starts).toEqual(expect.arrayContaining([
      "/api/auth/me", "/api/households/current", "/api/home/today"
    ]));
    releases.get("/api/auth/me")?.();
    releases.get("/api/households/current")?.();
    releases.get("/api/home/today")?.();
    await navigation;
    await expect(page.getByText("並列起動")).toBeVisible();
    console.log(`[WP4 timing][controlled preview] cold usable Home DOM=${Date.now() - Math.min(...startTimes)}ms`);
    expect(starts.filter((item) => item === "/api/home/today")).toHaveLength(1);
  });

  test("shows same-day IndexedDB cache while the authoritative Home request is held", async ({ page }) => {
    await seedSnapshot(page, { userId: user.id, householdId: household.id, date: today() }, homeData("IDBキャッシュ"));
    let releaseHome!: () => void;
    const homeHeld = new Promise<void>((resolve) => { releaseHome = resolve; });
    await installBasicRoutes(page, {
      home: async () => { await homeHeld; return envelope(homeData("サーバー最新")); }
    });
    const navigationStart = Date.now();
    await page.goto("/home");
    await expect(page.getByText("IDBキャッシュ")).toBeVisible();
    const cacheDomVisible = Date.now();
    await expect(page.getByText("最新情報を確認しています。")).toBeVisible();
    await page.screenshot({ path: path.join(artifactRoot, "01-cache-visible-390x844.png"), fullPage: true });

    await page.getByRole("button", { name: "IDBキャッシュの詳細" }).click();
    await expect(page.getByRole("button", { name: "完了" })).toBeDisabled();
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(artifactRoot, "02-cache-expanded-390x844.png"), fullPage: true });

    releaseHome();
    await expect(page.getByText("サーバー最新")).toBeVisible();
    console.log(`[WP4 timing][controlled preview] IDB cache DOM=${cacheDomVisible - navigationStart}ms; authoritative DOM=${Date.now() - navigationStart}ms`);
    await expect(page.getByText("最新情報を確認しています。")).toHaveCount(0);
    await page.screenshot({ path: path.join(artifactRoot, "03-authoritative-normal-390x844.png"), fullPage: true });
    await page.getByRole("button", { name: "サーバー最新の詳細" }).click();
    await expect(page.getByRole("button", { name: "完了" })).toBeEnabled();
  });

  test("keeps the shell honest while a no-cache Home request is pending", async ({ page }) => {
    let releaseHome!: () => void;
    const homeHeld = new Promise<void>((resolve) => { releaseHome = resolve; });
    await installBasicRoutes(page, { home: async () => { await homeHeld; return envelope(homeData("未使用")); } });
    const navigationStart = Date.now();
    await page.goto("/home");
    await expect(page.getByRole("heading", { name: "やること" })).toBeVisible();
    await expect(page.locator(".m2-home__refresh-status")).toHaveText("最新情報を確認しています。");
    await expect(page.getByText("やることはありません")).toHaveCount(0);
    await page.screenshot({ path: path.join(artifactRoot, "04-no-cache-pending-375x812.png"), fullPage: true });
    releaseHome();
  });

  test("retains cached tasks and reports a non-blocking refresh failure", async ({ page }) => {
    await seedSnapshot(page, { userId: user.id, householdId: household.id, date: today() }, homeData("失敗時キャッシュ"));
    await installBasicRoutes(page, { home: () => envelope({}, 503) });
    await page.goto("/home");
    await expect(page.getByText("失敗時キャッシュ")).toBeVisible();
    await expect(page.getByText("最新情報を取得できませんでした。")).toBeVisible();
    await page.screenshot({ path: path.join(artifactRoot, "05-refresh-failure-375x812.png"), fullPage: true });
  });

  test("uses memory cache on Home revisit before the second network response", async ({ page }) => {
    let homeCalls = 0;
    let releaseSecondHome!: () => void;
    const secondHomeHeld = new Promise<void>((resolve) => { releaseSecondHome = resolve; });
    await installBasicRoutes(page, {
      home: async (count) => {
        homeCalls = count;
        if (count === 2) await secondHomeHeld;
        return envelope(homeData("メモリキャッシュ"));
      }
    });
    const navigationStart = Date.now();
    await page.goto("/home");
    await expect(page.getByText("メモリキャッシュ")).toBeVisible();
    const firstHomeDom = Date.now();
    await page.goto("/calendar");
    await expect(page.locator(".calendar-page")).toBeVisible();
    await page.goto("/home");
    await expect(page.getByText("メモリキャッシュ")).toBeVisible();
    console.log(`[WP4 timing][controlled preview] first Home DOM=${firstHomeDom - navigationStart}ms; memory revisit DOM=${Date.now() - navigationStart}ms`);
    expect(homeCalls).toBe(2);
    releaseSecondHome();
  });

  test("never displays a persistent Home snapshot before authentication", async ({ page }) => {
    await seedSnapshot(page, { userId: user.id, householdId: household.id, date: today() }, homeData("漏えいしてはいけない家事"));
    await installBasicRoutes(page, {
      auth: envelope({ code: "UNAUTHENTICATED" }, 401),
      home: () => envelope(homeData("漏えいしてはいけない家事"), 200)
    });
    await page.goto("/home");
    await expect(page.getByRole("heading", { name: "ログイン" })).toBeVisible();
    await expect(page.getByText("漏えいしてはいけない家事")).toHaveCount(0);
  });

  test("isolates household and date keys", async ({ page }) => {
    await seedSnapshot(page, { userId: user.id, householdId: "household-a", date: today() }, homeData("家庭Aの家事"));
    await seedSnapshot(page, { userId: user.id, householdId: household.id, date: "2026-08-31" }, homeData("昨日の家事", "2026-08-31"));
    await installBasicRoutes(page, {
      home: () => envelope({ ...homeData("家庭Bの最新"), homeTasks: [] })
    });
    await page.goto("/home");
    await expect(page.getByText("家庭Aの家事")).toHaveCount(0);
    await expect(page.getByText("昨日の家事")).toHaveCount(0);
    await expect(page.getByText("家庭Bの最新")).toHaveCount(0);
    await expect(page.getByText("やることはありません")).toBeVisible();
  });

  test("locks initial cached mutations, then leaves later revalidation enabled", async ({ page }) => {
    await seedSnapshot(page, { userId: user.id, householdId: household.id, date: today() }, homeData("ロック対象"));
    let releaseInitial!: () => void;
    const initialHeld = new Promise<void>((resolve) => { releaseInitial = resolve; });
    let homeCalls = 0;
    await installBasicRoutes(page, {
      home: async (count) => {
        homeCalls = count;
        if (count === 1) await initialHeld;
        return envelope(homeData("ロック対象"));
      }
    });
    await page.goto("/home");
    await page.getByRole("button", { name: "ロック対象の詳細" }).click();
    await expect(page.getByRole("button", { name: "完了" })).toBeDisabled();
    releaseInitial();
    await expect(page.getByRole("button", { name: "完了" })).toBeEnabled();

    let releaseRefresh!: () => void;
    const refreshHeld = new Promise<void>((resolve) => { releaseRefresh = resolve; });
    await page.route("**/api/home/today", async (route) => {
      homeCalls += 1;
      await refreshHeld;
      return route.fulfill(envelope(homeData("ロック対象")));
    });
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect.poll(() => homeCalls).toBe(2);
    await expect(page.getByRole("button", { name: "完了" })).toBeEnabled();
    releaseRefresh();
  });

  test("continues to server data when IndexedDB is unavailable", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "indexedDB", { configurable: true, get: () => { throw new Error("blocked"); } });
    });
    await installBasicRoutes(page, { home: () => envelope(homeData("IDBなしでも表示")) });
    await page.goto("/home");
    await expect(page.getByText("IDBなしでも表示")).toBeVisible();
  });

  test("discards the pre-auth bootstrap and fetches fresh Home after login", async ({ page }) => {
    let authenticated = false;
    let homeCalls = 0;
    const homeAuthStates: boolean[] = [];
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      if (!url.pathname.startsWith("/api/")) return route.continue();
      if (url.pathname === "/api/auth/me") return route.fulfill(unauthenticated());
      if (url.pathname === "/api/auth/login") {
        authenticated = true;
        return route.fulfill(envelope({ user }));
      }
      if (url.pathname === "/api/households/current") {
        return authenticated ? route.fulfill(envelope({ household })) : route.fulfill(unauthenticated());
      }
      if (url.pathname === "/api/home/today") {
        homeCalls += 1;
        homeAuthStates.push(authenticated);
        return authenticated ? route.fulfill(envelope(homeData("ログイン後の新しい家事"))) : route.fulfill(unauthenticated());
      }
      return route.fulfill(envelope({}));
    });

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "ログイン" })).toBeVisible();
    await page.getByLabel("メールアドレス").fill(user.email);
    await page.getByLabel("パスワード").fill("very-long-password");
    await page.getByRole("button", { name: "ログイン" }).click();

    await expect(page.getByText("ログイン後の新しい家事")).toBeVisible();
    await expect(page.getByText("最新情報を取得できませんでした。")).toHaveCount(0);
    expect(homeCalls).toBe(2);
    expect(homeAuthStates).toEqual([false, true]);
  });

  test("uses a fresh Home request after unauthenticated registration and household creation", async ({ page }) => {
    let authenticated = false;
    let householdReady = false;
    let homeCalls = 0;
    const homeAuthStates: boolean[] = [];
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (!url.pathname.startsWith("/api/")) return route.continue();
      if (url.pathname === "/api/auth/me") return route.fulfill(unauthenticated());
      if (url.pathname === "/api/auth/register") {
        authenticated = true;
        return route.fulfill(envelope({ user }, 201));
      }
      if (url.pathname === "/api/households/current") {
        if (!authenticated) return route.fulfill(unauthenticated());
        return route.fulfill(envelope({ household: householdReady ? household : null }));
      }
      if (url.pathname === "/api/households" && request.method() === "POST") {
        householdReady = true;
        return route.fulfill(envelope({ household }, 201));
      }
      if (url.pathname === "/api/home/today") {
        homeCalls += 1;
        homeAuthStates.push(authenticated);
        return authenticated && householdReady
          ? route.fulfill(envelope(homeData("登録後の新しい家事")))
          : route.fulfill(unauthenticated());
      }
      return route.fulfill(envelope({}));
    });

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "ログイン" })).toBeVisible();
    await page.getByRole("link", { name: "アカウントを作る" }).click();
    await page.getByLabel("表示名").fill("登録テスト");
    await page.getByLabel("メールアドレス").fill(user.email);
    await page.getByLabel("パスワード").fill("very-long-password");
    await page.getByRole("button", { name: "新規登録" }).click();
    await expect(page.getByRole("heading", { name: "家庭を作る" })).toBeVisible();
    await page.getByLabel("家庭名").fill("登録テスト家庭");
    await page.getByRole("button", { name: "家庭を作る" }).click();

    await expect(page.getByText("登録後の新しい家事")).toBeVisible();
    await expect(page.getByText("最新情報を取得できませんでした。")).toHaveCount(0);
    expect(homeCalls).toBe(2);
    expect(homeAuthStates).toEqual([false, true]);
  });

  test("discards the pre-household bootstrap before creating a household", async ({ page }) => {
    let householdReady = false;
    let homeCalls = 0;
    let releaseBootstrap!: () => void;
    const bootstrapHeld = new Promise<void>((resolve) => { releaseBootstrap = resolve; });
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (!url.pathname.startsWith("/api/")) return route.continue();
      if (url.pathname === "/api/auth/me") return route.fulfill(envelope({ user }));
      if (url.pathname === "/api/households/current") return route.fulfill(envelope({ household: householdReady ? household : null }));
      if (url.pathname === "/api/households" && request.method() === "POST") {
        householdReady = true;
        return route.fulfill(envelope({ household }, 201));
      }
      if (url.pathname === "/api/home/today") {
        homeCalls += 1;
        if (homeCalls === 1) {
          await bootstrapHeld;
          return route.fulfill(envelope({}, 503));
        }
        return route.fulfill(envelope(homeData("作成後の新しい家事")));
      }
      return route.fulfill(envelope({}));
    });

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "家庭を作る" })).toBeVisible();
    await page.getByLabel("家庭名").fill("作成テスト家庭");
    await page.getByRole("button", { name: "家庭を作る" }).click();

    await expect(page.getByText("作成後の新しい家事")).toBeVisible();
    expect(homeCalls).toBe(2);
    releaseBootstrap();
  });

  test("discards the pre-household bootstrap before joining a household", async ({ page }) => {
    let householdReady = false;
    let homeCalls = 0;
    let releaseBootstrap!: () => void;
    const bootstrapHeld = new Promise<void>((resolve) => { releaseBootstrap = resolve; });
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (!url.pathname.startsWith("/api/")) return route.continue();
      if (url.pathname === "/api/auth/me") return route.fulfill(envelope({ user }));
      if (url.pathname === "/api/households/current") return route.fulfill(envelope({ household: householdReady ? household : null }));
      if (url.pathname === "/api/households/join" && request.method() === "POST") {
        householdReady = true;
        return route.fulfill(envelope({ household }));
      }
      if (url.pathname === "/api/home/today") {
        homeCalls += 1;
        if (homeCalls === 1) {
          await bootstrapHeld;
          return route.fulfill(envelope({}, 503));
        }
        return route.fulfill(envelope(homeData("参加後の新しい家事")));
      }
      return route.fulfill(envelope({}));
    });

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "家庭を作る" })).toBeVisible();
    await page.getByRole("link", { name: "招待から参加" }).click();
    await expect(page.getByRole("heading", { name: "招待から参加" })).toBeVisible();
    await page.getByLabel("招待コード").fill("JOIN-CODE");
    await page.getByRole("button", { name: "参加する" }).click();

    await expect(page.getByText("参加後の新しい家事")).toBeVisible();
    expect(homeCalls).toBe(2);
    releaseBootstrap();
  });
});
