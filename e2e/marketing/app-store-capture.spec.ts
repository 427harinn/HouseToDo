import { expect, test, type Browser, type BrowserContext, type Locator, type Page, type Route } from "@playwright/test";
import { copyFile, mkdir, readFile, unlink } from "node:fs/promises";
import path from "node:path";

type Fixture = {
  captureTime: string;
  household: Record<string, unknown>;
  user: Record<string, unknown>;
  members: Array<Record<string, unknown>>;
  tasks: Array<Record<string, unknown>>;
  completedRecords: Array<Record<string, unknown>>;
  shopping: { pending: Array<Record<string, unknown>>; purchased: Array<Record<string, unknown>> };
  notifications: Record<string, unknown>;
};

const repoRoot = path.resolve(process.cwd());
const fixturePath = path.join(repoRoot, "marketing/app-store/fixtures/house-to-do.json");
const screenshotsDir = path.join(repoRoot, "marketing/app-store/raw/screenshots");
const videosDir = path.join(repoRoot, "marketing/app-store/raw/videos");
const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as Fixture;
const apiEnvelope = (data: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data, requestId: "marketing-fixture" }) });
const iso = "2026-09-07T00:00:00.000Z";

const avatarUrl = (id: string) => `/api/users/${id}/avatar?v=marketing`;
const memberResponse = (member: Record<string, unknown>) => ({
  userId: member.userId,
  displayName: member.displayName,
  role: member.role,
  color: member.color,
  joinedAt: member.joinedAt,
  avatarUrl: avatarUrl(String(member.userId))
});

const taskResponse = (task: Record<string, unknown>, status: "pending" | "completed" | "skipped" = "pending") => ({
  ...task,
  assignment: { type: task.assignmentType, user: task.assignedUserId ? { userId: task.assignedUserId } : null },
  status,
  actedBy: null,
  startedAt: null,
  completedAt: status === "completed" ? iso : null,
  skippedAt: status === "skipped" ? iso : null,
  note: task.description,
  scopeKind: task.modelRecurrenceType === "weekly_flexible" || task.modelRecurrenceType === "monthly_flexible" ? "period" : "occurrence",
  occurrenceKey: `${task.id}:2026-09-07`,
  periodKey: task.modelRecurrenceType === "weekly_flexible" ? "2026-09-07" : task.modelRecurrenceType === "monthly_flexible" ? "2026-09" : null,
  periodStart: task.modelRecurrenceType === "weekly_flexible" ? "2026-09-07" : task.modelRecurrenceType === "monthly_flexible" ? "2026-09-01" : null,
  periodEnd: task.modelRecurrenceType === "weekly_flexible" ? "2026-09-13" : task.modelRecurrenceType === "monthly_flexible" ? "2026-09-30" : null,
  completedCount: status === "completed" ? 1 : 0,
  overdue: false
});

const homeHistory = (record: Record<string, unknown>) => ({
  ...record,
  actualCompleter: { ...record.actualCompleter, avatarUrl: avatarUrl(String((record.actualCompleter as Record<string, unknown>).userId)) },
  assignedUser: null
});

const dateRange = (from: string, to: string) => {
  const dates: string[] = [];
  for (let date = new Date(`${from}T00:00:00Z`); date <= new Date(`${to}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + 1)) dates.push(date.toISOString().slice(0, 10));
  return dates;
};

const calendarMarker = (date: string) => {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  const tasks: Array<{ id: string; title: string; deadline: boolean }> = [];
  if ([1, 4].includes(day)) tasks.push({ id: "task-trash", title: "ゴミ出し", deadline: true });
  if ([2, 5].includes(day)) tasks.push({ id: "task-plants", title: "植物の水やり", deadline: true });
  tasks.push({ id: "task-bird-food", title: "インコの餌交換", deadline: false });
  if (date === "2026-09-15") tasks.push({ id: "task-drain", title: "排水口の掃除", deadline: false });
  return { fixedCount: tasks.length, fixedCompletedCount: 0, fixedSkippedCount: 0, shoppingCount: 0, purchasedShoppingCount: 0, tasks };
};

const shoppingResponse = (item: Record<string, unknown>) => ({
  id: item.id,
  name: item.name,
  quantity: item.quantity,
  note: item.note,
  plannedPurchaseDate: null,
  status: item.status,
  addedBy: item.addedBy,
  purchasedBy: item.purchasedBy ? { userId: item.purchasedBy, displayName: "ソラ" } : null,
  purchasedAt: item.purchasedAt ?? null,
  sortOrder: item.sortOrder,
  createdAt: iso,
  updatedAt: iso,
  image: item.image ? { available: true, width: 512, height: 512, size: 1_942_859, updatedAt: iso } : null
});

const createMarketingState = () => ({
  completedTaskIds: new Set<string>(),
  skippedTaskIds: new Set<string>(),
  purchasedItemIds: new Set<string>()
});

async function seedApi(page: Page) {
  const state = createMarketingState();
  await page.context().grantPermissions(["notifications"], { origin: "http://127.0.0.1:4173" });
  await page.addInitScript(() => {
    const registration = { pushManager: { getSubscription: async () => ({ endpoint: "https://marketing.invalid/subscription", toJSON: () => ({ keys: {} }) }) } };
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { getRegistration: async () => registration } });
    const MarketingNotification = function () {};
    Object.defineProperty(MarketingNotification, "permission", { value: "granted" });
    Object.defineProperty(MarketingNotification, "requestPermission", { value: async () => "granted" });
    Object.defineProperty(window, "Notification", { configurable: true, value: MarketingNotification });
  });
  await page.route("**/api/**", async (route: Route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;
    if (!pathname.startsWith("/api/")) return route.continue();
    if (pathname.includes("/api/users/") && pathname.endsWith("/avatar")) {
      const id = pathname.split("/")[3];
      const member = fixture.members.find((entry) => entry.userId === id);
      if (member?.avatar) return route.fulfill({ path: path.join(repoRoot, String(member.avatar)), contentType: "image/png" });
    }
    if (pathname === "/api/shopping/items/shopping-bird-food/image") {
      return route.fulfill({ path: path.join(repoRoot, "marketing/app-store/assets/shopping/bird-food.png"), contentType: "image/png" });
    }
    if (pathname === "/api/auth/me") return route.fulfill(apiEnvelope({ user: { ...fixture.user, avatarUrl: avatarUrl("sora") } }));
    if (pathname === "/api/households/current") return route.fulfill(apiEnvelope({ household: fixture.household }));
    if (pathname === "/api/households/current/members") return route.fulfill(apiEnvelope({ members: fixture.members.map(memberResponse) }));
    if (pathname === "/api/households/current/image-usage") return route.fulfill(apiEnvelope({ activeCount: 1, activeCountLimit: 50, activeBytes: 1_942_859, activeBytesLimit: 50 * 1024 * 1024, reservedCount: 0, reservedBytes: 0, pendingCleanupBytes: 0, pendingCleanupUnknownCount: 0, storedBytes: 1_942_859, storedBytesKnown: true, storedBytesLimit: 75 * 1024 * 1024, dailyUploadDate: "2026-09-07", dailyUploadCount: 0, dailyUploadLimit: 20 }));
    if (pathname === "/api/home/today") {
      const homeTasks = fixture.tasks.slice(0, 4).filter((task) => !state.completedTaskIds.has(String(task.id)) && !state.skippedTaskIds.has(String(task.id))).map((task) => taskResponse(task));
      return route.fulfill(apiEnvelope({ date: "2026-09-07", homeTasks, completedRecords: fixture.completedRecords.map(homeHistory), passedRecords: [], shopping: { pendingCount: fixture.shopping.pending.filter((item) => !state.purchasedItemIds.has(String(item.id))).length }, members: fixture.members.map(memberResponse) }));
    }
    if (pathname === "/api/tasks/recent") return route.fulfill(apiEnvelope({ tasks: fixture.tasks.map((task) => taskResponse(task)) }));
    if (pathname === "/api/tasks/calendar/range") {
      const from = url.searchParams.get("from") ?? "2026-08-30";
      const to = url.searchParams.get("to") ?? "2026-10-10";
      return route.fulfill(apiEnvelope({ from, to, today: "2026-09-07", timezone: "Asia/Tokyo", dates: Object.fromEntries(dateRange(from, to).map((date) => [date, calendarMarker(date)])) }));
    }
    if (pathname === "/api/tasks/calendar/day") {
      const date = url.searchParams.get("date") ?? "2026-09-10";
      const fixed = ["task-trash", "task-bird-food"].map((id) => fixture.tasks.find((task) => task.id === id)).filter(Boolean).map((task) => taskResponse(task!));
      const weeklyFlexible = fixture.tasks.filter((task) => task.modelRecurrenceType === "weekly_flexible").map((task) => taskResponse(task));
      const monthlyFlexible = fixture.tasks.filter((task) => task.modelRecurrenceType === "monthly_flexible").map((task) => taskResponse(task));
      const completed = date === "2026-09-07" ? fixture.completedRecords.map((record) => ({
        ...record,
        taskId: record.taskId,
        selectedDate: date,
        actualCompleter: { ...record.actualCompleter, avatarUrl: avatarUrl(String((record.actualCompleter as Record<string, unknown>).userId)) }
      })) : [];
      return route.fulfill(apiEnvelope({ today: "2026-09-07", timezone: "Asia/Tokyo", selectedDate: date, selected: { fixed, weeklyFlexible, monthlyFlexible, completed, shopping: [] } }));
    }
    if (pathname === "/api/shopping/items") {
      const pending = fixture.shopping.pending.filter((item) => !state.purchasedItemIds.has(String(item.id))).map(shoppingResponse);
      const purchased = [...fixture.shopping.purchased, ...fixture.shopping.pending.filter((item) => state.purchasedItemIds.has(String(item.id)))].map(shoppingResponse);
      return route.fulfill(apiEnvelope({ pending, purchased }));
    }
    if (pathname === "/api/shopping/recent") return route.fulfill(apiEnvelope({ items: fixture.shopping.pending.map((item) => ({ name: item.name, quantity: item.quantity, note: item.note, createdAt: iso })) }));
    if (pathname === "/api/shopping/templates") return route.fulfill(apiEnvelope({ templates: [] }));
    if (pathname.match(/^\/api\/shopping\/items\/[^/]+$/) && route.request().method() === "GET") {
      const itemId = pathname.split("/")[4];
      const item = [...fixture.shopping.pending, ...fixture.shopping.purchased].find((entry) => entry.id === itemId);
      if (item) return route.fulfill(apiEnvelope({ item: shoppingResponse(item) }));
    }
    if (pathname.match(/^\/api\/shopping\/items\/[^/]+\/purchase$/)) {
      const itemId = pathname.split("/")[4];
      state.purchasedItemIds.add(itemId);
      const item = fixture.shopping.pending.find((entry) => entry.id === itemId);
      return route.fulfill(apiEnvelope({ item: shoppingResponse({ ...item, status: "purchased", purchasedBy: "sora", purchasedAt: iso }) }));
    }
    if (pathname.match(/^\/api\/tasks\/[^/]+\/(complete|skip)$/)) {
      const [, taskId, action] = pathname.match(/^\/api\/tasks\/([^/]+)\/(complete|skip)$/)!;
      (action === "complete" ? state.completedTaskIds : state.skippedTaskIds).add(taskId);
      const task = fixture.tasks.find((entry) => entry.id === taskId);
      return route.fulfill(apiEnvelope({ result: taskResponse(task!, action === "complete" ? "completed" : "skipped") }));
    }
    if (pathname === "/api/notifications/settings") {
      if (route.request().method() === "PATCH") return route.fulfill(apiEnvelope(fixture.notifications));
      return route.fulfill(apiEnvelope(fixture.notifications));
    }
    if (pathname === "/api/notifications/subscriptions") return route.fulfill(apiEnvelope({ registered: true, removed: true }));
    if (pathname === "/api/notifications/vapid-public-key") return route.fulfill(apiEnvelope({ publicKey: "marketing-fixture" }));
    return route.fulfill(apiEnvelope({}));
  });
  return state;
}

const settle = async (page: Page) => {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(250);
  await page.mouse.move(1, 1);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
};

const pause = (page: Page, milliseconds: number) => page.waitForTimeout(milliseconds);

const swipeLeft = async (page: Page, row: Locator, distance = 100) => {
  const box = await row.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width - 30, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width - 30 - distance, box!.y + box!.height / 2, { steps: 8 });
  await page.mouse.up();
};

const openPage = async (page: Page, route: string) => {
  await page.goto(route);
  await settle(page);
};

const captureCandidate = async (page: Page, folder: string, fileName: string, route: string, prepare?: () => Promise<void>) => {
  await openPage(page, route);
  if (prepare) await prepare();
  await settle(page);
  await pause(page, 700);
  await mkdir(path.join(screenshotsDir, folder), { recursive: true });
  await page.screenshot({ path: path.join(screenshotsDir, folder, fileName), fullPage: false });
};

test.describe("raw screenshots", () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });

  test("writes the six unmodified App Store source screenshots", async ({ page }) => {
    await mkdir(screenshotsDir, { recursive: true });
    await page.clock.install({ time: fixture.captureTime });
    await seedApi(page);
    const captures: Array<[string, string, () => Promise<void>]> = [
      ["01-home.png", "/home", async () => expect(page.getByRole("heading", { name: "やること" })).toBeVisible()],
      ["02-task-form.png", "/tasks/new", async () => {
        await page.getByLabel("家事名").fill("換気扇の掃除");
        await page.getByRole("button", { name: /繰り返し:/ }).click();
        await page.getByRole("dialog").getByRole("button", { name: "今週のどこか" }).click();
        await page.locator("#m2-task-start-date").fill("2026-09-07");
        await page.getByLabel("終日").uncheck();
        await page.locator("#m2-task-time").fill("18:00");
        await page.locator("#m2-task-notification").selectOption("60");
        await page.getByRole("button", { name: /^担当:/ }).click();
        await page.getByRole("dialog").getByRole("button", { name: /ソラ/ }).click();
        await page.getByLabel("メモ").fill("今週中にできればOK");
      }],
      ["03-repeat-sheet.png", "/tasks/new", async () => {
        await page.getByLabel("家事名").fill("換気扇の掃除");
        await page.getByRole("button", { name: /繰り返し:/ }).click();
        await page.getByRole("dialog").getByRole("button", { name: "今週のどこか" }).click();
        await page.getByRole("button", { name: /繰り返し: 今週のどこか/ }).click();
        await expect(page.getByRole("dialog", { name: "繰り返し" })).toBeVisible();
      }],
      ["04-calendar.png", "/calendar?date=2026-09-10", async () => expect(page.getByRole("dialog", { name: /9月10日/ })).toBeVisible()],
      ["05-shopping.png", "/shopping?item=shopping-bird-food", async () => {
        await expect(page.getByText("インコの餌", { exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: "購入", exact: true })).toBeVisible();
        await expect(page.getByAltText("インコの餌の写真")).toBeVisible();
      }],
      ["06-notifications.png", "/other/notifications", async () => {
        await expect(page.getByRole("checkbox", { name: "朝のまとめ通知" })).toBeChecked();
        await expect(page.getByRole("checkbox", { name: "夜のまとめ通知" })).toBeChecked();
        await expect(page.getByLabel("朝のまとめ通知の時刻")).toHaveValue("09:00");
        await expect(page.getByLabel("夜のまとめ通知の時刻")).toHaveValue("21:00");
      }]
    ];
    for (const [fileName, route, prepare] of captures) {
      await openPage(page, route);
      await prepare();
      await settle(page);
      await page.screenshot({ path: path.join(screenshotsDir, fileName), fullPage: false });
    }
  });
});

test.describe("additional raw screenshot candidates", () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });

  test("writes additional major screen and interaction states", async ({ page }) => {
    await page.clock.install({ time: fixture.captureTime });
    await seedApi(page);

    await captureCandidate(page, "home", "home-normal.png", "/home");
    await captureCandidate(page, "home", "home-assignees.png", "/home");
    await captureCandidate(page, "home", "home-task-expanded.png", "/home", async () => {
      await page.getByRole("button", { name: "ゴミ出しの詳細" }).click();
    });
    await captureCandidate(page, "home", "home-swipe-actions.png", "/home", async () => {
      await swipeLeft(page, page.locator(".m2-home__row", { hasText: "ゴミ出し" }));
      await expect(page.locator(".m2-home__row", { hasText: "ゴミ出し" }).getByRole("button", { name: "パス", exact: true })).toBeVisible();
    });
    await captureCandidate(page, "home", "home-completed-open.png", "/home", async () => {
      await page.getByRole("button", { name: "完了済み 1" }).click();
      await expect(page.getByText("洗濯", { exact: true })).toBeVisible();
    });

    const fillTaskForm = async () => {
      await page.getByLabel("家事名").fill("換気扇の掃除");
      await page.getByRole("button", { name: /繰り返し:/ }).click();
      await page.getByRole("dialog", { name: "繰り返し" }).getByRole("button", { name: "毎週", exact: true }).click();
      await page.getByRole("dialog", { name: "繰り返し" }).getByRole("button", { name: "月", exact: true }).click();
      await page.getByRole("dialog", { name: "繰り返し" }).getByRole("button", { name: "決定", exact: true }).click();
      await page.getByLabel("日にちを決めない").check();
      await page.getByLabel("終日").uncheck();
      await page.locator("#m2-task-time").fill("18:00");
      await page.locator("#m2-task-notification").selectOption("60");
      await page.getByRole("button", { name: /^担当:/ }).click();
      await page.getByRole("dialog").getByRole("button", { name: /ソラ/ }).click();
      await page.getByLabel("メモ").fill("今週中にできればOK");
    };
    const openRepeat = async () => {
      await page.getByRole("button", { name: /繰り返し:/ }).click();
      return page.getByRole("dialog", { name: "繰り返し" });
    };

    await captureCandidate(page, "task-form", "task-form-filled.png", "/tasks/new", fillTaskForm);
    await captureCandidate(page, "task-form", "task-repeat-options.png", "/tasks/new", async () => {
      await openRepeat();
    });
    await captureCandidate(page, "task-form", "task-repeat-weekdays.png", "/tasks/new", async () => {
      const dialog = await openRepeat();
      await dialog.getByRole("button", { name: "毎週", exact: true }).click();
    });
    await captureCandidate(page, "task-form", "task-repeat-weekdays-selected.png", "/tasks/new", async () => {
      const dialog = await openRepeat();
      await dialog.getByRole("button", { name: "毎週", exact: true }).click();
      await dialog.getByRole("button", { name: "月", exact: true }).click();
      await dialog.getByRole("button", { name: "木", exact: true }).click();
      await dialog.getByRole("button", { name: "金", exact: true }).click();
    });
    await captureCandidate(page, "task-form", "task-repeat-monthly-fixed.png", "/tasks/new", async () => {
      const dialog = await openRepeat();
      await dialog.getByRole("button", { name: "毎月", exact: true }).click();
    });
    await captureCandidate(page, "task-form", "task-repeat-weekly-flexible.png", "/tasks/new", async () => {
      const dialog = await openRepeat();
      await dialog.getByRole("button", { name: "毎週", exact: true }).click();
      await dialog.getByRole("button", { name: "決定", exact: true }).click();
      await page.getByLabel("日にちを決めない").check();
    });
    await captureCandidate(page, "task-form", "task-repeat-monthly-flexible.png", "/tasks/new", async () => {
      const dialog = await openRepeat();
      await dialog.getByRole("button", { name: "毎月", exact: true }).click();
      await dialog.getByRole("button", { name: "決定", exact: true }).click();
      await page.getByLabel("日にちを決めない").check();
    });
    await captureCandidate(page, "task-form", "task-assignee-sheet.png", "/tasks/new", async () => {
      await page.getByRole("button", { name: /^担当:/ }).click();
      await expect(page.getByRole("dialog", { name: "担当" }).getByText("ソラ", { exact: true })).toBeVisible();
      await expect(page.getByRole("dialog", { name: "担当" }).getByText("ミナ", { exact: true })).toBeVisible();
    });
    await captureCandidate(page, "task-form", "task-form-time-notification.png", "/tasks/new", async () => {
      await fillTaskForm();
    });
    await captureCandidate(page, "task-form", "task-reuse-sheet.png", "/tasks/new", async () => {
      await page.getByRole("button", { name: "以前の項目から選ぶ" }).click();
      await expect(page.getByRole("dialog", { name: "以前の項目から選ぶ" })).toBeVisible();
    });

    await captureCandidate(page, "calendar", "calendar-month.png", "/calendar");
    await captureCandidate(page, "calendar", "calendar-date-sheet.png", "/calendar?date=2026-09-10");
    await captureCandidate(page, "calendar", "calendar-date-task-expanded.png", "/calendar?date=2026-09-10", async () => {
      await page.getByRole("button", { name: "ゴミ出しの詳細" }).click();
    });
    await captureCandidate(page, "calendar", "calendar-completed-open.png", "/calendar?date=2026-09-07", async () => {
      await page.getByRole("button", { name: /完了済み 1/ }).click();
      await expect(page.getByText("洗濯", { exact: true })).toBeVisible();
    });

    await captureCandidate(page, "shopping", "shopping-list.png", "/shopping");
    await captureCandidate(page, "shopping", "shopping-item-expanded.png", "/shopping?item=shopping-bird-food");
    await captureCandidate(page, "shopping", "shopping-photo-memo.png", "/shopping?item=shopping-bird-food", async () => {
      await expect(page.getByText("いつもの小粒タイプ", { exact: true })).toBeVisible();
      await expect(page.getByAltText("インコの餌の写真")).toBeVisible();
    });
    await captureCandidate(page, "shopping", "shopping-purchased-open.png", "/shopping", async () => {
      await page.getByRole("button", { name: "購入済み 1件" }).click();
      await expect(page.getByText("洗剤", { exact: true })).toBeVisible();
    });
    await captureCandidate(page, "shopping", "shopping-swipe-edit.png", "/shopping", async () => {
      const row = page.locator("[data-shopping-m4-id='shopping-bird-food']");
      await swipeLeft(page, row);
      await expect(row.getByRole("button", { name: "編集", exact: true })).toBeVisible();
    });
    await captureCandidate(page, "shopping", "shopping-reuse-sheet.png", "/shopping/new", async () => {
      await page.getByRole("button", { name: "以前の項目から選ぶ" }).click();
      await expect(page.getByRole("dialog", { name: "以前の項目から選ぶ" })).toBeVisible();
      await expect(page.getByRole("dialog").getByText("インコの餌", { exact: true })).toBeVisible();
    });
    await captureCandidate(page, "shopping", "shopping-new-form.png", "/shopping/new");
    await captureCandidate(page, "shopping", "shopping-image-form.png", "/shopping/items/shopping-bird-food/edit", async () => {
      await expect(page.getByAltText("インコの餌写真")).toBeVisible();
    });

    await captureCandidate(page, "settings", "settings-other.png", "/other");
    await captureCandidate(page, "settings", "settings-notifications.png", "/other/notifications");
    await captureCandidate(page, "settings", "settings-members.png", "/other/members", async () => {
      await expect(page.getByText("ソラ", { exact: true })).toBeVisible();
      await expect(page.getByText("ミナ", { exact: true })).toBeVisible();
    });
    await captureCandidate(page, "settings", "settings-account.png", "/other/account", async () => {
      await expect(page.getByRole("img", { name: "アバター: ソラ" })).toBeVisible();
    });
    await captureCandidate(page, "settings", "settings-household.png", "/other/household");
    await captureCandidate(page, "add-sheet", "add-sheet.png", "/home", async () => {
      await page.getByRole("button", { name: "追加" }).click();
      await expect(page.getByRole("dialog", { name: "追加" })).toBeVisible();
      await expect(page.getByRole("dialog", { name: "追加" }).getByRole("button", { name: "家事" })).toBeVisible();
      await expect(page.getByRole("dialog", { name: "追加" }).getByRole("button", { name: "買い物" })).toBeVisible();
    });
  });
});

const makeVideoContext = async (browser: Browser): Promise<{ context: BrowserContext; page: Page; videoPath: () => Promise<string | null> }> => {
  const context = await browser.newContext({ baseURL: "http://127.0.0.1:4173", viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, recordVideo: { dir: videosDir, size: { width: 390, height: 844 } } });
  const page = await context.newPage();
  const video = page.video();
  await page.clock.install({ time: fixture.captureTime });
  await seedApi(page);
  return { context, page, videoPath: async () => video ? video.path() : null };
};

const saveVideo = async (capture: Awaited<ReturnType<typeof makeVideoContext>>, fileName: string) => {
  await capture.page.close();
  await capture.context.close();
  const videoPath = await capture.videoPath();
  if (!videoPath) return;
  const destination = path.join(videosDir, fileName);
  await copyFile(videoPath, destination);
  if (path.resolve(videoPath) !== path.resolve(destination)) await unlink(videoPath);
};

test.describe("raw videos", () => {
  test("records basic home actions as a 390x844 Playwright video", async ({ browser }) => {
    await mkdir(videosDir, { recursive: true });
    const capture = await makeVideoContext(browser);
    try {
      await capture.page.goto("/home");
      await settle(capture.page);
      await pause(capture.page, 1_500);
      await capture.page.getByRole("button", { name: "ゴミ出しの詳細" }).click();
      await pause(capture.page, 1_800);
      await capture.page.getByRole("button", { name: "完了", exact: true }).click();
      await expect(capture.page.getByRole("button", { name: "ゴミ出しの詳細" })).toHaveCount(0);
      await pause(capture.page, 1_700);
      const row = capture.page.locator(".m2-home__row", { hasText: "インコの餌交換" });
      await pause(capture.page, 700);
      const box = await row.boundingBox();
      expect(box).not.toBeNull();
      await capture.page.mouse.move(box!.x + box!.width - 30, box!.y + box!.height / 2);
      await capture.page.mouse.down();
      await capture.page.mouse.move(box!.x + box!.width - 130, box!.y + box!.height / 2, { steps: 8 });
      await capture.page.mouse.up();
      await expect(row.getByRole("button", { name: "パス", exact: true })).toBeVisible();
      await pause(capture.page, 2_000);
    } finally {
      await saveVideo(capture, "01-basic-home-actions.webm");
    }
  });

  test("records the feature walkthrough as a 390x844 Playwright video", async ({ browser }) => {
    await mkdir(videosDir, { recursive: true });
    const capture = await makeVideoContext(browser);
    try {
      await capture.page.goto("/home");
      await settle(capture.page);
      await pause(capture.page, 1_500);
      await capture.page.getByRole("button", { name: "追加" }).click();
      await pause(capture.page, 2_200);
      await capture.page.getByRole("dialog", { name: "追加" }).getByRole("button", { name: "家事" }).click();
      await expect(capture.page).toHaveURL(/\/tasks\/new$/);
      await pause(capture.page, 1_500);
      await capture.page.getByRole("button", { name: /繰り返し:/ }).click();
      await pause(capture.page, 2_300);
      await capture.page.getByRole("dialog", { name: "繰り返し" }).getByRole("button", { name: "今週のどこか", exact: true }).click();
      await pause(capture.page, 800);
      await capture.page.getByRole("button", { name: "戻る" }).click();
      await pause(capture.page, 1_500);
      await capture.page.getByRole("button", { name: "カレンダー" }).click();
      await expect(capture.page).toHaveURL(/\/calendar$/);
      await pause(capture.page, 1_500);
      await capture.page.getByRole("gridcell", { name: /9月10日/ }).click();
      await expect(capture.page.getByRole("dialog", { name: /9月10日/ })).toBeVisible();
      await pause(capture.page, 2_300);
      await capture.page.getByRole("dialog", { name: /9月10日/ }).getByRole("button", { name: "閉じる" }).click();
      await pause(capture.page, 500);
      await capture.page.getByRole("button", { name: "買い物" }).click();
      await pause(capture.page, 1_500);
      await capture.page.getByRole("button", { name: "インコの餌" }).click();
      await pause(capture.page, 1_800);
      await capture.page.getByRole("button", { name: "購入", exact: true }).click();
      await expect(capture.page.getByText("購入済み 2件")).toBeVisible();
      await pause(capture.page, 1_800);
      await capture.page.getByRole("button", { name: "その他" }).click();
      await pause(capture.page, 1_500);
      await capture.page.getByRole("link", { name: "通知" }).click();
      await expect(capture.page).toHaveURL(/\/other\/notifications$/);
      await expect(capture.page.getByRole("heading", { name: "通知" })).toBeVisible();
      await pause(capture.page, 1_800);
    } finally {
      await saveVideo(capture, "02-feature-walkthrough.webm");
    }
  });
});
