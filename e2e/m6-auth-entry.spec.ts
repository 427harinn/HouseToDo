import { expect, test, type Page, type Route } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

const user = { id: "m6-user", email: "m6@example.test", displayName: "M6 User" };
const household = { id: "m6-household", name: "M6 House", timezone: "Asia/Tokyo", weekStartsOn: 1, role: "owner" };

type EntryApiState = {
  authenticated: boolean;
  currentHousehold: typeof household | null;
  validInvite: boolean;
  loginFailure: boolean;
  registerCount: number;
  joinCount: number;
  validateCount: number;
  createCount: number;
};

const json = (route: Route, data: unknown, status = 200) =>
  route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, data, requestId: "m6-e2e" })
  });

const failure = (route: Route, code: string, status: number) =>
  route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify({ ok: false, error: { code, message: "fixture error" }, requestId: "m6-e2e" })
  });

const installEntryApi = async (page: Page, state: EntryApiState) => {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/auth/me") {
      return state.authenticated ? json(route, { user }) : failure(route, "UNAUTHENTICATED", 401);
    }
    if (url.pathname === "/api/auth/login") {
      if (state.loginFailure) return failure(route, "UNAUTHENTICATED", 401);
      state.authenticated = true;
      return json(route, { user });
    }
    if (url.pathname === "/api/auth/register") {
      state.registerCount += 1;
      state.authenticated = true;
      return json(route, { user }, 201);
    }
    if (url.pathname === "/api/households/current") return json(route, { household: state.currentHousehold });
    if (url.pathname === "/api/households/invites/validate") {
      state.validateCount += 1;
      return json(route, { valid: state.validInvite });
    }
    if (url.pathname === "/api/households/join") {
      state.joinCount += 1;
      const body = JSON.parse(request.postData() ?? "{}") as { code?: string };
      if (body.code !== "VALID-CODE") return failure(route, "INVALID_INVITE", 400);
      state.currentHousehold = household;
      return json(route, { household });
    }
    if (url.pathname === "/api/households") {
      state.createCount += 1;
      state.currentHousehold = household;
      return json(route, { household }, 201);
    }
    if (url.pathname === "/api/dashboard/today") {
      return json(route, {
        date: "2026-08-26",
        household,
        summary: { total: 0, pending: 0, inProgress: 0, completed: 0, skipped: 0 },
        todayTasks: [], homeTasks: [], weeklyTasks: [], completedRecords: [], passedRecords: [],
        shopping: { pendingCount: 0, previewItems: [] }, members: []
      });
    }
    return failure(route, "NOT_FOUND", 404);
  });
};

const fillRegister = async (page: Page, code = "") => {
  await page.getByLabel("表示名").fill("M6 User");
  await page.getByLabel("メールアドレス").fill("new-m6@example.test");
  await page.getByLabel("パスワード").fill("very-long-password");
  if (code) await page.getByLabel("招待コード（任意）").fill(code);
};

test("M6 redirects Guest/Onboarding/protected routes and keeps Entry routes nav-free", async ({ page }) => {
  const state: EntryApiState = { authenticated: false, currentHousehold: null, validInvite: false, loginFailure: false, registerCount: 0, joinCount: 0, validateCount: 0, createCount: 0 };
  await installEntryApi(page, state);

  for (const path of ["/", "/guest", "/onboarding", "/home", "/calendar", "/shopping", "/other", "/household/create", "/household/join"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  }
  await expect(page.getByRole("heading", { name: "ログイン" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "主要画面" })).toHaveCount(0);

  await page.getByRole("link", { name: "アカウントを作る" }).click();
  await expect(page).toHaveURL(/\/register$/);
  await expect(page.getByRole("navigation", { name: "主要画面" })).toHaveCount(0);
  await expect(page.getByText("ゲストで試す")).toHaveCount(0);
});

test("M6 login invalid stays on Login, then reaches Home after correction", async ({ page }) => {
  const state: EntryApiState = { authenticated: false, currentHousehold: household, validInvite: false, loginFailure: true, registerCount: 0, joinCount: 0, validateCount: 0, createCount: 0 };
  await installEntryApi(page, state);
  await page.goto("/login");
  await page.getByLabel("メールアドレス").fill(user.email);
  await page.getByLabel("パスワード").fill("wrong-password");
  await page.getByRole("button", { name: "ログイン" }).click();
  await expect(page.getByRole("alert")).toHaveText("メールアドレスまたはパスワードが正しくありません");
  await expect(page.getByLabel("パスワード")).toHaveAttribute("aria-invalid", "true");
  await expect(page).toHaveURL(/\/login$/);

  state.loginFailure = false;
  await page.getByLabel("パスワード").fill("very-long-password");
  await page.getByRole("button", { name: "ログイン" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole("heading", { name: "やること" })).toBeVisible();
});

test("M6 register without invite goes directly to Create then Home", async ({ page }) => {
  const state: EntryApiState = { authenticated: false, currentHousehold: null, validInvite: false, loginFailure: false, registerCount: 0, joinCount: 0, validateCount: 0, createCount: 0 };
  await installEntryApi(page, state);
  await page.goto("/register");
  await fillRegister(page);
  await page.getByRole("button", { name: "新規登録" }).click();
  await expect(page).toHaveURL(/\/household\/create$/);
  await expect(page.getByRole("heading", { name: "家庭を作る" })).toBeVisible();
  await expect(page.getByText("家庭をはじめましょう")).toHaveCount(0);
  await page.getByLabel("家庭名").fill("M6 Home");
  await page.getByRole("button", { name: "家庭を作る" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole("heading", { name: "やること" })).toBeVisible();
  expect(state.registerCount).toBe(1);
  expect(state.joinCount).toBe(0);
  expect(state.createCount).toBe(1);
});

test("M6 register invite rejects before register, then joins Home with a valid code", async ({ page }) => {
  const state: EntryApiState = { authenticated: false, currentHousehold: null, validInvite: false, loginFailure: false, registerCount: 0, joinCount: 0, validateCount: 0, createCount: 0 };
  await installEntryApi(page, state);
  await page.goto("/register");
  await fillRegister(page, "INVALID-CODE");
  await page.getByRole("button", { name: "新規登録" }).click();
  await expect(page.getByRole("alert")).toHaveText("招待コードを確認してください");
  await expect(page).toHaveURL(/\/register$/);
  expect(state.registerCount).toBe(0);

  state.validInvite = true;
  await page.getByLabel("招待コード（任意）").fill("VALID-CODE");
  await page.getByRole("button", { name: "新規登録" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole("heading", { name: "やること" })).toBeVisible();
  expect(state.validateCount).toBe(2);
  expect(state.registerCount).toBe(1);
  expect(state.joinCount).toBe(1);
});

test("M6 household Join keeps invalid input and reaches Home on valid code", async ({ page }) => {
  const state: EntryApiState = { authenticated: true, currentHousehold: null, validInvite: true, loginFailure: false, registerCount: 0, joinCount: 0, validateCount: 0, createCount: 0 };
  await installEntryApi(page, state);
  await page.goto("/household/join");
  await expect(page.getByRole("heading", { name: "招待から参加" })).toBeVisible();
  await page.getByLabel("招待コード").fill("INVALID-CODE");
  await page.getByRole("button", { name: "参加する" }).click();
  await expect(page.getByRole("alert")).toHaveText("招待コードを確認してください");
  await expect(page.getByLabel("招待コード")).toHaveValue("INVALID-CODE");
  await page.getByLabel("招待コード").fill("VALID-CODE");
  await page.getByRole("button", { name: "参加する" }).click();
  await expect(page).toHaveURL(/\/home$/);
  expect(state.joinCount).toBe(2);
});
