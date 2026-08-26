/* eslint-disable no-undef */
import { copyFile, mkdir } from "node:fs/promises";
import { chromium, request } from "@playwright/test";

const base = process.env.M8A_LOCAL_BASE_URL ?? "http://127.0.0.1:5174";
const output = "docs/evidence/m8a/motion/calendar-task-regression.webm";
const password = "very-long-password";
const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const dateKey = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};
const settle = (page) => page.waitForTimeout(700);

await mkdir("docs/evidence/m8a/motion", { recursive: true });
const api = await request.newContext({
  baseURL: base,
  extraHTTPHeaders: { origin: base }
});
const email = `m8a-calendar-${id}@example.test`;
const register = await api.post("/api/auth/register", {
  data: { email, displayName: `M8A Calendar ${id}`, password }
});
if (register.status() !== 201) throw new Error(`register failed: ${register.status()}`);
const household = await api.post("/api/households", {
  data: { name: `M8A Calendar House ${id}` }
});
if (household.status() !== 201)
  throw new Error(`household failed: ${household.status()}`);
const today = dateKey();
const title = `M8A calendar task ${id}`;
const task = await api.post("/api/tasks", {
  data: {
    title,
    modelRecurrenceType: "once",
    startDate: today,
    targetDate: today,
    assignmentType: "anyone",
    notificationSlot: "none"
  }
});
if (task.status() !== 201) throw new Error(`task setup failed: ${task.status()}`);
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  storageState: await api.storageState(),
  locale: "ja-JP",
  timezoneId: "Asia/Tokyo",
  viewport: { width: 390, height: 844 },
  recordVideo: {
    dir: "docs/evidence/m8a/motion/raw",
    size: { width: 390, height: 844 }
  }
});
const page = await context.newPage();
let source = null;
try {
  await page.goto(`${base}/calendar`);
  await page.getByRole("grid", { name: /カレンダー/ }).waitFor();
  await settle(page);
  await page.locator(`.calendar-day-task[title="${title}"]`).click();
  await page.getByRole("dialog").waitFor();
  await settle(page);
  const dialog = page.getByRole("dialog");
  await dialog
    .locator("button.calendar-detail-task__more")
    .evaluate((element) => (element instanceof HTMLElement ? element.click() : null));
  await dialog.locator(".calendar-detail-task__actions").waitFor();
  await dialog
    .locator(".calendar-detail-task__actions button", { hasText: "編集" })
    .evaluate((element) => (element instanceof HTMLElement ? element.click() : null));
  await page.locator("#m2-task-title").fill(`${title} edited`);
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.waitForURL(/\/calendar|\/home/);
  await page.goto(`${base}/home`);
  await page.getByRole("heading", { name: "やること" }).waitFor();
  await page.getByText(`${title} edited`).waitFor();
  await settle(page);
} finally {
  const video = page.video();
  source = video ? await video.path() : null;
  await context.close();
  await browser.close();
  await api.dispose();
}
if (!source) throw new Error("calendar motion video missing");
await copyFile(source, output);
console.log(JSON.stringify({ base, output, title }));
