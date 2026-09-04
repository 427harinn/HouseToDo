import { expect, test } from "@playwright/test";

const envelope = (data: unknown, status = 200) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify({ ok: true, data, requestId: "history-e2e" })
});

const historyRecords = Array.from({ length: 42 }, (_, index) => ({
  id: `history-${index}`,
  taskId: `task-${index}`,
  title: index === 0 ? "ゴミ出し" : index === 1 ? "食器洗い" : `家事 ${index + 1}`,
  description: index === 0 ? "ゴミ袋は玄関に置いてあります" : index === 1 ? "洗剤を補充しておく" : null,
  completedAt: new Date(Date.UTC(2026, 8, 4, 0, 30) - index * 60 * 60 * 1000).toISOString(),
  actualCompleter: {
    userId: index % 2 === 0 ? "user-1" : "user-2",
    displayName: index % 2 === 0 ? "はる" : "しば",
    avatarUrl: null
  },
  taskActive: index !== 41
}));

const setupHistoryMock = async (page: import("@playwright/test").Page, empty = false) => {
  const household = { id: "house-1", name: "わが家", timezone: "Asia/Tokyo", weekStartsOn: 1, role: "owner" };
  const user = { id: "user-1", email: "haru@example.test", displayName: "はる", avatarUrl: null };
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/auth/me") return route.fulfill(envelope({ user }));
    if (url.pathname === "/api/households/current") return route.fulfill(envelope({ household }));
    if (url.pathname === "/api/history/tasks") {
      if (empty) return route.fulfill(envelope({ records: [], nextCursor: null }));
      const secondPage = url.searchParams.has("cursor");
      return route.fulfill(envelope({
        records: secondPage ? historyRecords.slice(40) : historyRecords.slice(0, 40),
        nextCursor: secondPage ? null : "fixture-next"
      }));
    }
    return route.fulfill(envelope({}));
  });
};

test.describe("Household completed history", () => {
  test.use({ viewport: { width: 390, height: 844 }, locale: "ja-JP", timezoneId: "Asia/Tokyo" });

  test("captures Other, grouped history, and pagination evidence", async ({ page }) => {
    await setupHistoryMock(page);
    await page.goto("/other");
    await expect(page.getByRole("link", { name: "履歴" })).toBeVisible();
    await page.screenshot({ path: "docs/evidence/household-completed-history/01-other-390x844.png" });

    await page.getByRole("link", { name: "履歴" }).click();
    await expect(page.getByRole("heading", { name: "履歴" })).toBeVisible();
    await expect(page.getByText("ゴミ出し")).toBeVisible();
    await expect(page.getByText("食器洗い")).toBeVisible();
    await expect(page.getByText("はる").first()).toBeVisible();
    await expect(page.getByText("しば").first()).toBeVisible();
    await page.getByText("ゴミ出し").click();
    await expect(page.getByText("ゴミ袋は玄関に置いてあります")).toBeVisible();
    await page.screenshot({ path: "docs/evidence/household-completed-history/05-other-history-expanded-390x844.png" });
    await page.getByText("ゴミ出し").click();
    await page.screenshot({ path: "docs/evidence/household-completed-history/06-other-history-closed-390x844.png" });
    await page.screenshot({ path: "docs/evidence/household-completed-history/02-history-grouped-390x844.png" });

    const more = page.getByRole("button", { name: "もっと見る" });
    await more.scrollIntoViewIfNeeded();
    await expect(more).toBeVisible();
    await page.screenshot({ path: "docs/evidence/household-completed-history/03-history-more-390x844.png" });
    await more.click();
    await expect(page.getByText("家事 42")).toBeVisible();
  });

  test("captures the empty state", async ({ page }) => {
    await setupHistoryMock(page, true);
    await page.goto("/other/history");
    await expect(page.getByText("まだ完了した家事はありません")).toBeVisible();
    await page.screenshot({ path: "docs/evidence/household-completed-history/04-history-empty-390x844.png" });
  });
});
