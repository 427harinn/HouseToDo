import { expect, test } from "@playwright/test";

const user = { id: "user-rollover", email: "rollover@example.test", displayName: "日付検証ユーザー", avatarUrl: null };
const household = { id: "household-rollover", name: "日付検証家庭", timezone: "Asia/Tokyo", weekStartsOn: 1, role: "owner" as const };
const dateA = "2026-09-01";
const dateB = "2026-09-02";

const makeTask = (date: string, title: string) => ({
  id: `task-${date}`,
  title,
  description: `${title}のメモ`,
  recurrenceType: "daily" as const,
  modelRecurrenceType: "daily" as const,
  assignmentType: "anyone" as const,
  assignedUserId: null,
  assignment: { type: "anyone" as const, user: null },
  scheduledTime: null,
  notificationSlot: "none" as const,
  weekdays: [],
  weeklyTargetCount: null,
  active: true,
  sortOrder: 0,
  createdBy: user.id,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  status: "pending" as const,
  actedBy: null,
  startedAt: null,
  completedAt: null,
  skippedAt: null,
  note: null,
  targetDate: date,
  deadlineDate: date,
  deadlineTime: null,
  scopeKind: "occurrence" as const,
  occurrenceKey: `task-${date}:${date}`,
  periodKey: null,
  periodStart: null,
  periodEnd: null
});

const homeFor = (date: string, title: string) => ({
  date,
  homeTasks: [makeTask(date, title)],
  completedRecords: [],
  passedRecords: [],
  shopping: { pendingCount: 0 },
  members: []
});

const envelope = (data: unknown) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({ ok: true, data, requestId: "home-rollover" })
});

test.describe("Home bootstrap date scope", () => {
  test("does not reuse date-A bootstrap after a household-local date rollover", async ({ page }) => {
    await page.clock.install({ time: new Date("2026-09-01T12:00:00+09:00") });
    let homeCalls = 0;
    const requestedDates: string[] = [];

    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      if (!url.pathname.startsWith("/api/")) return route.continue();
      if (url.pathname === "/api/auth/me") return route.fulfill(envelope({ user }));
      if (url.pathname === "/api/households/current") return route.fulfill(envelope({ household }));
      if (url.pathname === "/api/home/today") {
        homeCalls += 1;
        const responseDate = homeCalls === 1 ? dateA : dateB;
        requestedDates.push(responseDate);
        return route.fulfill(envelope(homeFor(responseDate, responseDate === dateA ? "日付Aの家事" : "日付Bの家事")));
      }
      return route.fulfill(envelope({}));
    });

    await page.goto("/home");
    await expect(page.getByText("日付Aの家事")).toBeVisible();
    expect(homeCalls).toBe(1);
    expect(requestedDates).toEqual([dateA]);

    await page.clock.setFixedTime(new Date("2026-09-02T12:00:00+09:00"));
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));

    await expect.poll(() => homeCalls).toBe(2);
    await expect(page.getByText("日付Bの家事")).toBeVisible();
    await expect(page.getByText("日付Aの家事")).toHaveCount(0);
    expect(requestedDates).toEqual([dateA, dateB]);
  });
});
