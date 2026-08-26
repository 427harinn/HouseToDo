import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const artifactRoot =
  process.env.PLAYWRIGHT_ARTIFACT_DIR ?? "artifacts/playwright/shopping-calendar-ui";
const artifactDir =
  artifactRoot.endsWith("/all-e2e") || artifactRoot.endsWith("\\all-e2e")
    ? path.join(artifactRoot, "shopping-calendar-ui")
    : artifactRoot;
const password = "very-long-password";

const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
const addDays = (value: string, amount: number) => {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
};
const formatCalendarDate = (value: string) =>
  new Intl.DateTimeFormat("ja-JP", {
    month: "long",
    day: "numeric",
    weekday: "short",
    timeZone: "UTC"
  }).format(new Date(`${value}T00:00:00Z`));
const shot = async (page: Page, name: string, fullPage = true) => {
  await mkdir(artifactDir, { recursive: true });
  await page.screenshot({ path: path.resolve(artifactDir, name), fullPage });
};
const expectNoHorizontalScroll = async (page: Page) => {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth + 1
      )
    )
    .toBe(true);
};

test("planned shopping date integrates with Calendar, purchase state, reuse exclusions, and responsive UI", async ({
  page
}) => {
  const id = stamp();
  const today = dateKey();
  const movedDate = addDays(today, 1);
  const itemName = `牛乳 ${id}`;
  const templateName = `ティッシュ ${id}`;
  const errors: string[] = [];
  const requestFailures: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message.text().includes("status of 401 (Unauthorized)")
    ) {
      errors.push(message.text());
    }
  });
  page.on("requestfailed", (request) => {
    if (request.failure()?.errorText !== "net::ERR_ABORTED") {
      requestFailures.push(`${request.method()} ${request.url()}`);
    }
  });

  await page.goto("/register");
  await page.locator("#register-name").fill(`Calendar Shopper ${id}`);
  await page.locator("#register-email").fill(`calendar-shopper-${id}@example.test`);
  await page.locator("#register-password").fill(password);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/household\/create|\/home/);
  await page.goto("/household/create");
  await page.locator("#household-name").fill(`Shopping Calendar House ${id}`);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/home/);

  const origin = { origin: new URL(page.url()).origin };
  for (const title of [`朝のタスク ${id}`, `夜のタスク ${id}`]) {
    const taskResponse = await page.request.post("/api/tasks", {
      headers: origin,
      data: {
        title,
        modelRecurrenceType: "daily",
        startDate: today,
        assignmentType: "anyone",
        notificationSlot: "none"
      }
    });
    expect(taskResponse.status()).toBe(201);
  }
  const templateResponse = await page.request.post("/api/shopping/templates", {
    headers: origin,
    data: { name: templateName, quantity: "1箱", note: "やわらかめ" }
  });
  expect(templateResponse.status()).toBe(201);

  await page.goto("/shopping/new");
  await expect(page.getByLabel("購入予定日")).toHaveValue("");
  await page.getByRole("button", { name: new RegExp(templateName) }).click();
  await expect(page.getByLabel("購入予定日")).toHaveValue("");
  await page.locator("#shopping-name").fill(itemName);
  await page.locator("#shopping-quantity").fill("1本");
  await page.locator("#shopping-note").fill("低脂肪ではないもの");
  await page.getByLabel("購入予定日").fill(today);
  await shot(page, "shopping-planned-date-form.png");
  await page.locator('form button[type="submit"]').click();
  await expect(page.getByRole("heading", { name: itemName })).toBeVisible();
  await expect(page.getByText("購入予定日")).toBeVisible();

  const unscheduledItemName = `トイレットペーパー ${id}`;
  const unscheduledResponse = await page.request.post("/api/shopping/items", {
    headers: origin,
    data: { name: unscheduledItemName }
  });
  expect(unscheduledResponse.status()).toBe(201);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/calendar");
  const todayCell = page.locator(
    `.calendar-cell[aria-label^="${formatCalendarDate(today)}"]`
  );
  await expect(todayCell).toHaveAttribute(
    "aria-label",
    new RegExp("タスク2件、買うもの1件")
  );
  await expect(page.getByRole("heading", { name: "買うもの" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: new RegExp(`${itemName}、未購入`) })
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: new RegExp(`${unscheduledItemName}、未購入、予定日未定`)
    })
  ).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, "calendar-shopping-unscheduled.png");
  await shot(page, "calendar-shopping-mixed-schedule.png");

  const otherDateCell = page.locator(
    `.calendar-cell[aria-label^="${formatCalendarDate(movedDate)}"]`
  );
  await expect(otherDateCell).toHaveAttribute("aria-label", new RegExp("買うもの0件"));
  await otherDateCell.click();
  await expect(
    page.getByRole("button", {
      name: new RegExp(`${unscheduledItemName}、未購入、予定日未定`)
    })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: new RegExp(`${itemName}、未購入`) })
  ).toBeHidden();

  await page.goto(`/calendar?date=${today}`);
  await expect(
    page.getByRole("button", { name: new RegExp(`${itemName}、未購入`) })
  ).toBeVisible();
  await page.getByRole("button", { name: new RegExp(`${itemName}、未購入`) }).click();
  await expect(page).toHaveURL(/\/shopping\/items\/[^/]+$/);
  await expect(page.getByRole("heading", { name: itemName })).toBeVisible();

  await page.goto("/shopping");
  await page.getByRole("button", { name: `${itemName}を購入済みにする` }).click();
  await expect(
    page.getByRole("button", { name: `${itemName}を未購入へ戻す` })
  ).toBeVisible();
  await page.goto("/calendar");
  await expect(
    page.getByRole("button", { name: new RegExp(`${itemName}、購入済み`) })
  ).toBeVisible();
  await expect(todayCell).toHaveAttribute("aria-label", new RegExp("買うもの1件"));
  await page.goto("/shopping");
  const shoppingPurchaseDateTime = page.getByText(/2026\/\d+\/\d+ \d{2}:\d{2}/);
  await expect(shoppingPurchaseDateTime).toBeVisible();
  await shoppingPurchaseDateTime.evaluate((element) =>
    element.scrollIntoView({ block: "center", inline: "nearest" })
  );
  await shot(page, "shopping-purchased-datetime.png", false);
  await page.goto("/calendar");

  await page.getByRole("button", { name: new RegExp(`${itemName}、購入済み`) }).click();
  await expect(page.getByText("購入日時")).toBeVisible();
  await expect(page.getByText(/2026\/\d+\/\d+ \d{2}:\d{2}/)).toBeVisible();
  await page.getByRole("button", { name: "編集" }).click();
  await expect(page.getByLabel("購入予定日")).toHaveValue(today);
  await page.getByLabel("購入予定日").fill(movedDate);
  await page.locator('form button[type="submit"]').click();
  await expect(page.getByText("購入予定日")).toBeVisible();

  await page.goto("/calendar");
  const originalCell = page.locator(
    `.calendar-cell[aria-label^="${formatCalendarDate(today)}"]`
  );
  const movedCell = page.locator(
    `.calendar-cell[aria-label^="${formatCalendarDate(movedDate)}"]`
  );
  await expect(originalCell).toHaveAttribute("aria-label", new RegExp("買うもの0件"));
  await expect(movedCell).toHaveAttribute("aria-label", new RegExp("買うもの1件"));
  await movedCell.click();
  await expect(
    page.getByRole("button", { name: new RegExp(`${itemName}、購入済み`) })
  ).toBeVisible();

  await page.goto("/shopping/new");
  await page.getByRole("button", { name: new RegExp(itemName) }).click();
  await expect(page.getByLabel("購入予定日")).toHaveValue("");
  await page.getByRole("button", { name: new RegExp(templateName) }).click();
  await expect(page.getByLabel("購入予定日")).toHaveValue("");

  for (const size of [
    { width: 320, height: 720 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 1280, height: 900 }
  ]) {
    await page.setViewportSize(size);
    await page.goto(`/calendar?date=${movedDate}`);
    await expect(page.getByRole("heading", { name: "買うもの" })).toBeVisible();
    await expectNoHorizontalScroll(page);
  }

  expect(errors).toEqual([]);
  expect(requestFailures).toEqual([]);
});
