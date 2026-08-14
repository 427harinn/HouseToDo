import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const artifactRoot = process.env.PLAYWRIGHT_ARTIFACT_DIR ?? "artifacts/playwright/calendar-ui";
const password = "very-long-password";

const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const dateKey = () => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};
const addDays = (value: string, amount: number) => {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
};
const weekday = (value: string) => new Date(`${value}T00:00:00Z`).getUTCDay();
const shot = async (page: Page, name: string) => {
  await mkdir(artifactRoot, { recursive: true });
  await page.screenshot({ path: path.resolve(artifactRoot, name), fullPage: true });
};
const expectNoHorizontalScroll = async (page: Page) => {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
};

test("calendar supports month navigation, selected-date sections, markers, and task detail navigation", async ({ page }) => {
  const id = stamp();
  const today = dateKey();
  const user = { email: `calendar-${id}@example.test`, name: `Calendar User ${id}` };
  const errors: string[] = [];
  const requestFailures: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("status of 401 (Unauthorized)")) errors.push(message.text());
  });
  page.on("requestfailed", (request) => requestFailures.push(`${request.method()} ${request.url()}`));

  await page.goto("/register");
  await page.locator("#register-name").fill(user.name);
  await page.locator("#register-email").fill(user.email);
  await page.locator("#register-password").fill(password);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/onboarding|\/home/);
  await page.goto("/household/create");
  await page.locator("#household-name").fill(`Calendar House ${id}`);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/home/);

  const origin = { origin: new URL(page.url()).origin };
  const createTask = async (input: Record<string, unknown>) => {
    const response = await page.request.post("/api/tasks", {
      headers: origin,
      data: { assignmentType: "anyone", notificationSlot: "none", startDate: today, ...input }
    });
    expect(response.status()).toBe(201);
    return (await response.json()).data.task.id as string;
  };
  await createTask({ title: `Calendar once ${id}`, modelRecurrenceType: "once", targetDate: today });
  const dailyId = await createTask({ title: `Calendar daily ${id}`, modelRecurrenceType: "daily" });
  await createTask({ title: `Calendar weekly fixed ${id}`, modelRecurrenceType: "weekly_fixed", weekdays: [weekday(today)] });
  await createTask({ title: `Calendar monthly fixed ${id}`, modelRecurrenceType: "monthly_fixed", monthlyDayOfMonth: Number(today.slice(8, 10)) });
  await createTask({ title: `Calendar weekly flexible ${id}`, modelRecurrenceType: "weekly_flexible", weeklyDeadlineWeekday: weekday(today) });
  await createTask({ title: `Calendar monthly flexible ${id}`, modelRecurrenceType: "monthly_flexible", monthlyDeadlineType: "month_end" });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/calendar");
  await expect(page.getByRole("heading", { name: "カレンダー" })).toBeVisible();
  await expect(page.locator(".calendar-cell--today")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "今日のタスク" }).first()).toBeVisible();
  await expect(page.getByText(`Calendar weekly flexible ${id}`)).toBeVisible();
  await expect(page.getByText(`Calendar monthly flexible ${id}`)).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, "calendar-mobile.png");
  await shot(page, "calendar-flexible-sections.png");

  const tomorrow = addDays(today, 1);
  await page.locator(`.calendar-cell[aria-label^="${new Intl.DateTimeFormat("ja-JP", { month: "long", day: "numeric", weekday: "short", timeZone: "UTC" }).format(new Date(`${tomorrow}T00:00:00Z`))}"]`).click();
  await expect(page.getByRole("heading", { name: /のタスク$/ }).first()).toBeVisible();
  await shot(page, "calendar-selected-date.png");

  await page.getByRole("button", { name: "次月" }).click();
  await expect(page.getByRole("heading", { name: /2026年|年.*月/ }).first()).toBeVisible();
  await page.getByRole("button", { name: "前月" }).click();
  await page.getByRole("button", { name: "今日" }).click();
  await expect(page.getByRole("heading", { name: "今日のタスク" }).first()).toBeVisible();

  await page.setViewportSize({ width: 320, height: 720 });
  await expectNoHorizontalScroll(page);
  await page.setViewportSize({ width: 430, height: 844 });
  await expectNoHorizontalScroll(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/calendar");
  await expect(page.getByRole("heading", { name: "カレンダー" })).toBeVisible();
  await shot(page, "calendar-desktop.png");

  await page.getByRole("button", { name: new RegExp(`Calendar daily ${id}`) }).click();
  await expect(page).toHaveURL(new RegExp(`/tasks/${dailyId}$`));
  expect(errors).toEqual([]);
  expect(requestFailures).toEqual([]);
});
