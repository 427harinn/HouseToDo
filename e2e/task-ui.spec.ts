import { expect, test, type Browser, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const artifactRoot = process.env.PLAYWRIGHT_ARTIFACT_DIR ?? "artifacts/playwright/task-ui";
const artifactDir = artifactRoot.endsWith("/all-e2e") || artifactRoot.endsWith("\\all-e2e")
  ? path.join(artifactRoot, "task-ui")
  : artifactRoot;
const password = "very-long-password";

type TestUser = {
  email: string;
  name: string;
};

type ApiTask = {
  id: string;
  title: string;
};

type Member = {
  userId: string;
  displayName: string;
};

const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const todayKey = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};
const todayWeekday = () => new Date(`${todayKey()}T00:00:00+09:00`).getDay();

const shot = async (page: Page, name: string) => {
  await mkdir(artifactDir, { recursive: true });
  await page.screenshot({ path: path.resolve(artifactDir, name), fullPage: true });
};

const expectNoHorizontalScroll = async (page: Page) => {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1))
    .toBe(true);
};

const waitForApp = async (page: Page) => {
  await expect(async () => {
    const response = await page.request.get("/api/health");
    expect(response.ok()).toBeTruthy();
  }).toPass({ timeout: 60_000 });
};

const registerViaUi = async (page: Page, user: TestUser) => {
  await page.goto("/register");
  await page.locator("#register-name").fill(user.name);
  await page.locator("#register-email").fill(user.email);
  await page.locator("#register-password").fill(password);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/onboarding|\/home/);
};

const loginViaUi = async (page: Page, user: TestUser) => {
  await page.goto("/login");
  await page.locator("#login-email").fill(user.email);
  await page.locator("#login-password").fill(password);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/home/);
};

const createHouseholdViaUi = async (page: Page, householdName: string) => {
  await page.goto("/household/create");
  await page.locator("#household-name").fill(householdName);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/home/);
};

const joinHouseholdViaUi = async (page: Page, inviteCode: string) => {
  await page.goto("/household/join");
  await page.locator("#invite-code").fill(inviteCode);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/home/);
};

const originHeader = (page: Page) => ({ origin: new URL(page.url()).origin });

const issueInvite = async (page: Page) => {
  const response = await page.request.post("/api/households/current/invites", {
    headers: originHeader(page),
    data: {}
  });
  expect(response.status()).toBe(201);
  const payload = await response.json();
  return payload.data.invite.code as string;
};

const getMembers = async (page: Page) => {
  const response = await page.request.get("/api/households/current/members");
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  return payload.data.members as Member[];
};

const createTaskByApi = async (
  page: Page,
  input: {
    title: string;
    recurrenceType?: "daily" | "scheduled" | "weekly";
    assignmentType?: "anyone" | "specific";
    assignedUserId?: string | null;
    weekdays?: number[];
    weeklyTargetCount?: number | null;
    scheduledTime?: string | null;
  }
) => {
  const response = await page.request.post("/api/tasks", {
    headers: originHeader(page),
    data: {
      title: input.title,
      description: `Description for ${input.title}`,
      recurrenceType: input.recurrenceType ?? "daily",
      assignmentType: input.assignmentType ?? "anyone",
      assignedUserId: input.assignedUserId ?? null,
      scheduledTime: input.scheduledTime ?? null,
      notificationSlot: "none",
      weekdays: input.weekdays ?? [],
      weeklyTargetCount: input.weeklyTargetCount ?? null
    }
  });
  expect(response.status()).toBe(201);
  const payload = await response.json();
  return payload.data.task as ApiTask;
};

const changeStateByApi = async (
  page: Page,
  taskId: string,
  action: "start" | "complete" | "skip" | "reset",
  note?: string
) => {
  const response = await page.request.post(`/api/tasks/${taskId}/${action}`, {
    headers: originHeader(page),
    data: { targetDate: todayKey(), note: note ?? null }
  });
  expect(response.ok()).toBeTruthy();
};

const getTaskByApi = async (page: Page, taskId: string) => {
  const response = await page.request.get(`/api/tasks/${taskId}`);
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  return payload.data.task as ApiTask & { active: boolean };
};

const createTaskViaUi = async (
  page: Page,
  title: string,
  options: {
    recurrenceType: "daily" | "scheduled" | "weekly";
    assignedUserId?: string;
  }
) => {
  await page.goto("/tasks/new");
  await page.locator("#task-title").fill(title);
  await page.locator("#task-description").fill(`Description for ${title}`);
  await page.locator("#task-type").selectOption(options.recurrenceType);
  if (options.assignedUserId) {
    await page.locator("#task-assignment").selectOption("specific");
    await page.locator("#task-assignee").selectOption(options.assignedUserId);
  }
  if (options.recurrenceType === "scheduled") {
    const today = todayWeekday();
    const tomorrow = (today + 1) % 7;
    await page.locator(".weekday-picker button").nth(today).click();
    await page.locator(".weekday-picker button").nth(tomorrow).click();
  }
  if (options.recurrenceType === "weekly") {
    await page.locator("#task-weekly-count").fill("2");
  }
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/tasks\/(?!new$)[^/]+$/);
  return page.url().split("/").pop()!;
};

const taskActionPanel = (page: Page) => page.locator("section.card").nth(1);

test.describe("task UI E2E", () => {
  test("covers task UI, screenshots, responsive sizes, and two isolated users", async ({ browser }: { browser: Browser }) => {
    const id = stamp();
    const userA = { email: `pw-a-${id}@example.test`, name: `User A ${id}` };
    const userB = { email: `pw-b-${id}@example.test`, name: `User B ${id}` };
    const contextA = await browser.newContext({ locale: "ja-JP", timezoneId: "Asia/Tokyo" });
    const contextB = await browser.newContext({ locale: "ja-JP", timezoneId: "Asia/Tokyo" });
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    await waitForApp(pageA);

    await registerViaUi(pageA, userA);
    await createHouseholdViaUi(pageA, `House ${id}`);
    await expect(pageA.locator("main")).toBeVisible();
    await shot(pageA, "01-home-empty.png");
    await expectNoHorizontalScroll(pageA);

    const inviteCode = await issueInvite(pageA);
    await registerViaUi(pageB, userB);
    await joinHouseholdViaUi(pageB, inviteCode);

    const sessionA = (await contextA.cookies()).find((cookie) => cookie.name === "house_todo_session")?.value;
    const sessionB = (await contextB.cookies()).find((cookie) => cookie.name === "house_todo_session")?.value;
    expect(sessionA).toBeTruthy();
    expect(sessionB).toBeTruthy();
    expect(sessionA).not.toBe(sessionB);

    const members = await getMembers(pageA);
    const memberB = members.find((member) => member.displayName === userB.name);
    expect(memberB).toBeTruthy();

    await pageA.goto("/tasks/new");
    await shot(pageA, "04-task-create-daily.png");
    const uiDailyId = await createTaskViaUi(pageA, `UI daily ${id}`, { recurrenceType: "daily" });

    await pageA.goto("/tasks/new");
    await pageA.locator("#task-type").selectOption("scheduled");
    await shot(pageA, "05-task-create-scheduled.png");
    await createTaskViaUi(pageA, `UI scheduled ${id}`, { recurrenceType: "scheduled" });

    await pageA.goto("/tasks/new");
    await pageA.locator("#task-type").selectOption("weekly");
    await shot(pageA, "06-task-create-weekly.png");
    await createTaskViaUi(pageA, `UI weekly ${id}`, { recurrenceType: "weekly" });

    await createTaskViaUi(pageA, `Assigned to B ${id}`, {
      recurrenceType: "daily",
      assignedUserId: memberB!.userId
    });

    const pendingTask = await createTaskByApi(pageA, { title: `pending long task ${id}` });
    const inProgressTask = await createTaskByApi(pageA, { title: `in-progress ${id}` });
    await changeStateByApi(pageA, inProgressTask.id, "start");
    const completedTask = await createTaskByApi(pageA, { title: `completed ${id}` });
    await changeStateByApi(pageA, completedTask.id, "complete");
    const skippedTask = await createTaskByApi(pageA, { title: `skipped ${id}` });
    await changeStateByApi(pageA, skippedTask.id, "skip", "skip reason from API");

    await pageA.goto("/home");
    await expect(pageA.getByText(`pending long task ${id}`)).toBeVisible();
    await expect(pageA.getByText(`completed ${id}`)).toBeVisible();
    await shot(pageA, "02-home-multiple-statuses.png");
    await expectNoHorizontalScroll(pageA);

    await pageA.goto("/tasks");
    await expect(pageA.getByText(`UI daily ${id}`)).toBeVisible();
    await shot(pageA, "03-task-list.png");

    await pageA.goto(`/tasks/${pendingTask.id}`);
    await expect(pageA.getByRole("heading", { name: `pending long task ${id}` })).toBeVisible();
    await shot(pageA, "07-task-detail-pending.png");

    await pageA.goto(`/tasks/${inProgressTask.id}`);
    await expect(pageA.getByRole("heading", { name: `in-progress ${id}` })).toBeVisible();
    await shot(pageA, "08-task-detail-in-progress.png");

    await pageA.goto(`/tasks/${completedTask.id}`);
    await expect(pageA.getByRole("heading", { name: `completed ${id}` })).toBeVisible();
    await shot(pageA, "09-task-detail-completed.png");

    await pageA.goto(`/tasks/${skippedTask.id}`);
    await expect(pageA.getByText("skip reason from API")).toBeVisible();
    await shot(pageA, "10-task-detail-skipped.png");

    const conflictTask = await createTaskByApi(pageA, { title: `conflict ${id}` });
    await pageB.goto(`/tasks/${conflictTask.id}`);
    await expect(pageB.getByRole("heading", { name: `conflict ${id}` })).toBeVisible();
    await changeStateByApi(pageA, conflictTask.id, "start");
    await taskActionPanel(pageB).locator("button").nth(1).click();
    await expect(pageB.getByRole("alert")).toBeVisible();
    await shot(pageB, "11-task-conflict.png");

    await pageA.goto(`/tasks/${uiDailyId}`);
    await taskActionPanel(pageA).locator("button").nth(1).click();
    await expect(pageA.locator('[role="alert"], [role="status"]')).toBeVisible();
    await expect(taskActionPanel(pageA).locator("button")).toHaveCount(4);

    await pageA.goto(`/tasks/${pendingTask.id}`);
    await taskActionPanel(pageA).locator("button").nth(1).click();
    await expect(pageA.locator('[role="alert"], [role="status"]')).toBeVisible();
    await taskActionPanel(pageA).locator("button").first().click();
    await expect(pageA.getByRole("heading", { name: `pending long task ${id}` })).toBeVisible();

    const skipUiTask = await createTaskByApi(pageA, { title: `skip-ui ${id}` });
    await pageA.goto(`/tasks/${skipUiTask.id}`);
    await pageA.locator("#skip-note").fill("skip note from UI");
    await taskActionPanel(pageA).locator("button").nth(2).click();
    await expect(pageA.getByText("skip note from UI")).toBeVisible();

    await pageA.goto(`/tasks/${skippedTask.id}`);
    pageA.once("dialog", (dialog) => dialog.accept());
    await taskActionPanel(pageA).locator("button.button--danger").click();
    await expect(pageA.getByRole("heading", { name: `skipped ${id}` })).toBeVisible();

    const editTask = await createTaskByApi(pageA, { title: `edit-source ${id}` });
    await pageA.goto(`/tasks/${editTask.id}/edit`);
    const editTitle = pageA.locator("#task-title");
    await expect(editTitle).toHaveValue(`edit-source ${id}`);
    await editTitle.clear();
    await editTitle.fill(`edited ${id}`);
    await expect(editTitle).toHaveValue(`edited ${id}`);
    const updateResponse = pageA.waitForResponse(
      (response) => response.url().includes(`/api/tasks/${editTask.id}`) && response.request().method() === "PATCH"
    );
    await pageA.locator('form button[type="submit"]').click();
    const updatePayload = await (await updateResponse).json();
    expect(updatePayload.data.task.title).toBe(`edited ${id}`);
    await expect(pageA.getByRole("heading", { name: `edited ${id}` })).toBeVisible();

    await pageA.goto("/tasks");
    const completedCard = pageA.locator(".management-card", { hasText: `completed ${id}` });
    pageA.once("dialog", (dialog) => dialog.accept());
    await completedCard.locator("button").last().click();
    await expect(async () => {
      const task = await getTaskByApi(pageA, completedTask.id);
      expect(task).toMatchObject({ active: false });
    }).toPass();
    await pageA.goto("/tasks");
    await expect(pageA.locator(".management-card", { hasText: `completed ${id}` })).toBeVisible();

    await pageB.goto("/home");
    await expect(pageB.getByText(userA.name).first()).toBeVisible();
    await expect(pageB.getByText(`Assigned to B ${id}`).first()).toBeVisible();

    for (const [name, size] of [
      ["12-mobile-320.png", { width: 320, height: 568 }],
      ["13-mobile-390.png", { width: 390, height: 844 }],
      ["mobile-430-check.png", { width: 430, height: 932 }],
      ["14-desktop.png", { width: 1280, height: 800 }]
    ] as const) {
      await pageA.setViewportSize(size);
      await pageA.goto("/home");
      await expect(pageA.locator(".bottom-nav")).toBeVisible({ timeout: 30_000 });
      await expect(pageA.getByText(`UI daily ${id}`).first()).toBeVisible({ timeout: 30_000 });
      await expectNoHorizontalScroll(pageA);
      await shot(pageA, name);
    }

    await pageA.goto("/tasks");
    await pageA.locator(".page-header button").click();
    await expect(pageA).toHaveURL(/\/login/);
    await pageA.goto("/tasks");
    await expect(pageA).toHaveURL(/\/login/);

    await contextA.close();
    await contextB.close();
  });
});
