import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const date = "2026-09-04";
const evidenceDir = path.resolve("docs/evidence/add-form-return-navigation");
const user = { id: "user-1", email: "navigation@example.test", displayName: "さや" };
const household = { id: "household-1", name: "わが家", timezone: "Asia/Tokyo", weekStartsOn: 1, role: "owner" };
const member = { userId: user.id, displayName: user.displayName, role: "owner", color: "#d9f2eb", avatarUrl: null };

test.use({ viewport: { width: 390, height: 844 } });

const json = (data: unknown, status = 200) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify({ ok: true, data, requestId: "return-navigation-e2e" })
});

const task = {
  id: "created-task",
  title: "追加した家事",
  description: null,
  recurrenceType: "once",
  modelRecurrenceType: "once",
  assignmentType: "anyone",
  assignedUserId: null,
  assignment: { type: "anyone", user: null },
  scheduledTime: null,
  notificationSlot: "none",
  notificationOffsetMinutes: null,
  weekdays: [],
  weeklyTargetCount: null,
  startDate: date,
  targetDate: date,
  deadlineTime: null,
  active: true,
  sortOrder: 1,
  createdBy: user.id,
  createdAt: "2026-09-04T00:00:00.000Z",
  updatedAt: "2026-09-04T00:00:00.000Z"
};

const shoppingItem = {
  id: "created-shopping-item",
  name: "追加した買い物",
  quantity: null,
  note: null,
  plannedPurchaseDate: null,
  status: "pending",
  addedBy: user.id,
  purchasedBy: null,
  purchasedAt: null,
  sortOrder: 1,
  createdAt: "2026-09-04T00:00:00.000Z",
  updatedAt: "2026-09-04T00:00:00.000Z",
  image: null
};

const installRoutes = async (page: Page) => {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/auth/me") return route.fulfill(json({ user }));
    if (url.pathname === "/api/households/current") return route.fulfill(json({ household }));
    if (url.pathname === "/api/households/current/members") return route.fulfill(json({ members: [member] }));
    if (url.pathname === "/api/households/current/image-usage") return route.fulfill(json({
      activeCount: 0,
      activeBytes: 0,
      reservedCount: 0,
      reservedBytes: 0,
      pendingCleanupBytes: 0,
      pendingCleanupUnknownCount: 0,
      storedBytes: 0,
      storedBytesKnown: true,
      activeCountLimit: 50,
      activeBytesLimit: 52428800,
      storedBytesLimit: 78643200,
      dailyUploadLimit: 20
    }));
    if (url.pathname === "/api/home/today") return route.fulfill(json({
      date,
      homeTasks: [],
      completedRecords: [],
      passedRecords: [],
      shopping: { pendingCount: 0 },
      members: [member]
    }));
    if (url.pathname === "/api/tasks/calendar/range") return route.fulfill(json({
      from: "2026-08-30",
      to: "2026-10-10",
      today: date,
      timezone: household.timezone,
      dates: {}
    }));
    if (url.pathname === "/api/tasks/calendar/day") return route.fulfill(json({
      today: date,
      timezone: household.timezone,
      selectedDate: url.searchParams.get("date") ?? date,
      selected: { fixed: [], weeklyFlexible: [], monthlyFlexible: [], completed: [], shopping: [] }
    }));
    if (url.pathname === "/api/tasks/recent") return route.fulfill(json({ tasks: [] }));
    if (url.pathname === "/api/tasks" && request.method() === "POST") return route.fulfill(json({ task }, 201));
    if (url.pathname === "/api/shopping/items" && request.method() === "GET") return route.fulfill(json({ pending: [], purchased: [] }));
    if (url.pathname === "/api/shopping/items" && request.method() === "POST") return route.fulfill(json({ item: shoppingItem }, 201));
    if (url.pathname === "/api/shopping/recent") return route.fulfill(json({ items: [] }));
    if (url.pathname === "/api/shopping/templates") return route.fulfill(json({ templates: [] }));
    throw new Error(`Unexpected navigation test API request: ${request.method()} ${url.pathname}`);
  });
};

const openAddForm = async (page: Page, label: "家事" | "買い物") => {
  if (await page.getByRole("dialog").count()) {
    await page.getByRole("button", { name: "閉じる", exact: true }).click();
  }
  await page.getByRole("button", { name: "追加" }).click();
  await page.getByRole("dialog").getByRole("button", { name: label, exact: true }).click();
  await expect(page.getByRole("heading", { name: label === "家事" ? "家事を追加" : "買い物を追加" })).toBeVisible();
};

const captureEvidence = async (page: Page, filename: string) => {
  await mkdir(evidenceDir, { recursive: true });
  await page.screenshot({ path: path.join(evidenceDir, filename), fullPage: false });
};

test("central add menu preserves every supported origin for task and shopping forms", async ({ page }) => {
  await installRoutes(page);
  const cases: Array<{ origin: string; label: "家事" | "買い物" }> = [
    { origin: "/home", label: "家事" },
    { origin: "/calendar", label: "家事" },
    { origin: `/calendar?date=${date}`, label: "家事" },
    { origin: "/shopping", label: "家事" },
    { origin: "/other", label: "家事" },
    { origin: "/home", label: "買い物" },
    { origin: "/calendar", label: "買い物" },
    { origin: "/shopping", label: "買い物" },
    { origin: "/other", label: "買い物" }
  ];

  for (const { origin, label } of cases) {
    await page.goto(origin);
    if (origin === "/home" && label === "家事") await captureEvidence(page, "home-task-add-origin.png");
    if (origin === "/shopping" && label === "買い物") await captureEvidence(page, "shopping-add-origin.png");
    if (origin === `/calendar?date=${date}` && label === "家事") {
      await expect(page.getByRole("dialog")).toBeVisible();
      await captureEvidence(page, "calendar-task-add-selected-date.png");
    }
    if (origin.includes("?date=")) {
      await page.getByRole("button", { name: "閉じる", exact: true }).click();
      await page.evaluate((nextOrigin) => window.history.replaceState({}, "", nextOrigin), origin);
    }
    await openAddForm(page, label);
    if (origin === "/home" && label === "家事") await captureEvidence(page, "home-task-add-form.png");
    if (origin === "/shopping" && label === "買い物") await captureEvidence(page, "shopping-add-form.png");
    if (origin === `/calendar?date=${date}` && label === "家事") await captureEvidence(page, "calendar-task-add-form.png");
    expect(new URL(page.url()).searchParams.get("returnTo")).toBe(origin);
    await page.getByRole("button", { name: "戻る" }).click();
    await expect(page).toHaveURL(new RegExp(`${origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
    if (origin === "/home" && label === "家事") await captureEvidence(page, "home-task-return.png");
    if (origin === "/shopping" && label === "買い物") await captureEvidence(page, "shopping-add-return.png");
    if (origin === `/calendar?date=${date}` && label === "家事") {
      await expect(page.getByRole("dialog")).toBeVisible();
      await captureEvidence(page, "calendar-task-return-same-date.png");
    }
  }
});

test("successful task and shopping additions return to the origin and replace the form history", async ({ page }) => {
  await installRoutes(page);

  await page.goto(`/calendar?date=${date}`);
  await page.goto(`/calendar?date=${date}`);
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.evaluate((nextOrigin) => window.history.replaceState({}, "", nextOrigin), `/calendar?date=${date}`);
  await openAddForm(page, "家事");
  await page.getByLabel("家事名").fill("追加した家事");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page).toHaveURL(new RegExp(`/calendar\\?date=${date}$`));
  await page.goBack();
  await expect(page).not.toHaveURL(/\/tasks\/new/);

  await page.goto("/other");
  await page.goto("/other");
  await openAddForm(page, "買い物");
  await page.getByLabel("商品名").fill("追加した買い物");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page).toHaveURL(/\/other$/);
  await page.goBack();
  await expect(page).not.toHaveURL(/\/shopping\/new/);
});

test("unsafe and unknown returnTo values use the form defaults", async ({ page }) => {
  await installRoutes(page);

  for (const value of ["https://example.com/steal", "//example.com/steal", "/does-not-exist"]) {
    await page.goto(`/tasks/new?returnTo=${encodeURIComponent(value)}`);
    await expect(page.getByRole("heading", { name: "家事を追加" })).toBeVisible();
    await page.getByRole("button", { name: "戻る" }).click();
    await expect(page).toHaveURL(/\/home$/);
  }

  await page.goto(`/shopping/new?returnTo=${encodeURIComponent("https://example.com/steal")}`);
  await expect(page.getByRole("heading", { name: "買い物を追加" })).toBeVisible();
  await page.getByRole("button", { name: "戻る" }).click();
  await expect(page).toHaveURL(/\/shopping$/);
});
