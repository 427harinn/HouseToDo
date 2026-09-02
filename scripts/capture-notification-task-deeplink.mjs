import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const outputDir = "artifacts/screenshots";
await mkdir(outputDir, { recursive: true });

const today = "2026-09-02";
const members = [{ userId: "user-1", displayName: "さや", role: "owner", color: "#d9f2eb", avatarUrl: null }];
const tasks = Array.from({ length: 14 }, (_, index) => {
  const id = `visual-task-${index + 1}`;
  return {
    id,
    title: index === 8 ? "通知から開いた家事" : `長い一覧の家事 ${index + 1}`,
    description: index === 8 ? "通知からすぐ完了できます" : "一覧のスクロール確認用メモ",
    recurrenceType: "daily",
    modelRecurrenceType: "daily",
    assignmentType: "anyone",
    assignedUserId: null,
    assignment: { type: "anyone", user: null },
    scheduledTime: null,
    notificationSlot: "none",
    weekdays: [],
    weeklyTargetCount: null,
    active: true,
    sortOrder: index + 1,
    createdBy: "user-1",
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-01T00:00:00Z",
    status: "pending",
    actedBy: null,
    startedAt: null,
    completedAt: null,
    skippedAt: null,
    note: null,
    targetDate: today,
    deadlineDate: today,
    deadlineTime: `${String(8 + (index % 8)).padStart(2, "0")}:00`,
    overdue: false
  };
});

const home = {
  date: today,
  homeTasks: tasks,
  completedRecords: [],
  passedRecords: [],
  shopping: { pendingCount: 2 },
  members
};

const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 375, height: 812 }]) {
    const page = await browser.newPage({ viewport });
    await page.route("**/*", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (!path.startsWith("/api/")) {
        await route.continue();
        return;
      }
      const body = path === "/api/auth/me"
        ? { user: { id: "user-1", email: "a@example.com", displayName: "さや" } }
        : path === "/api/households/current"
          ? { household: { id: "household-1", name: "わが家", timezone: "Asia/Tokyo", weekStartsOn: 1, role: "owner" } }
          : path === "/api/home/today"
            ? home
            : { activeCount: 0, activeCountLimit: 50, activeBytes: 0, activeBytesLimit: 1, reservedCount: 0, reservedBytes: 0, pendingCleanupBytes: 0, pendingCleanupUnknownCount: 0, storedBytes: 0, storedBytesKnown: true, storedBytesLimit: 1, dailyUploadDate: today, dailyUploadCount: 0, dailyUploadLimit: 20 };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: body, requestId: "visual" }) });
    });
    await page.goto("http://127.0.0.1:5174/home?task=visual-task-9");
    await page.getByRole("button", { name: "完了" }).waitFor();
    await page.screenshot({ path: `${outputDir}/notification-task-deeplink-${viewport.width}x${viewport.height}.png` });
    await page.close();
  }
} finally {
  await browser.close();
}
