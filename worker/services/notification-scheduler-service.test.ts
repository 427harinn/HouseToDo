import { describe, expect, it } from "vitest";
import { getLocalDate, getLocalTime } from "../lib/date-time";
import { createNotificationSchedulerRepositories } from "../repositories/notification-scheduler-repository";
import { MemoryD1 } from "../test-utils/memory-d1";
import { isIncomplete, isTaskDueToday, NotificationSchedulerService } from "./notification-scheduler-service";
import type { Task } from "../types/domain";

const task = (overrides: Partial<Task> = {}): Task => ({
  id: "task-1", householdId: "house-1", title: "掃除", description: null,
  recurrenceType: "daily", assignmentType: "anyone", assignedUserId: null,
  scheduledTime: null, notificationSlot: "none", notificationTime: "21:00",
  weeklyTargetCount: null, active: true, sortOrder: 1, createdBy: "user-1",
  createdAt: "2026-01-01", updatedAt: "2026-01-01", weekdays: [], ...overrides
});

describe("notification scheduler rules", () => {
  it("selects daily and matching scheduled tasks, excluding weekly", () => {
    expect(isTaskDueToday(task(), "2026-08-13")).toBe(true);
    expect(isTaskDueToday(task({ recurrenceType: "scheduled", weekdays: [4] }), "2026-08-13")).toBe(true);
    expect(isTaskDueToday(task({ recurrenceType: "scheduled", weekdays: [5] }), "2026-08-13")).toBe(false);
    expect(isTaskDueToday(task({ recurrenceType: "weekly" }), "2026-08-13")).toBe(false);
  });

  it("only treats open task records as incomplete", () => {
    expect(isIncomplete(undefined)).toBe(true);
    expect(isIncomplete("in_progress")).toBe(true);
    expect(isIncomplete("completed")).toBe(false);
    expect(isIncomplete("skipped")).toBe(false);
  });

  it("uses the configured IANA timezone for date and time", () => {
    const instant = new Date("2026-08-13T12:00:00.000Z");
    expect(getLocalDate(instant, "Asia/Tokyo")).toBe("2026-08-13");
    expect(getLocalTime(instant, "Asia/Tokyo")).toBe("21:00");
    expect(getLocalDate(instant, "America/Los_Angeles")).toBe("2026-08-13");
    expect(getLocalTime(instant, "America/Los_Angeles")).toBe("05:00");
  });

  it("reclaims a stale crash claim and marks the delivery sent", async () => {
    const db = new MemoryD1();
    db.households.set("house-1", {
      id: "house-1", name: "House", timezone: "Asia/Tokyo", week_starts_on: 1,
      created_by: "user-1", created_at: "2026-01-01", updated_at: "2026-01-01"
    });
    db.users.set("user-1", {
      id: "user-1", email: "test@example.com", password_hash: "hash", display_name: "Test",
      created_at: "2026-01-01", updated_at: "2026-01-01"
    });
    db.members.set("house-1:user-1", {
      household_id: "house-1", user_id: "user-1", role: "owner", color: null, joined_at: "2026-01-01"
    });
    db.tasks.set("task-1", {
      id: "task-1", household_id: "house-1", title: "Task", description: null,
      recurrence_type: "daily", assignment_type: "anyone", assigned_user_id: null,
      scheduled_time: null, notification_slot: "none", notification_time: "21:00",
      weekly_target_count: null, active: 1, sort_order: 1, created_by: "user-1",
      created_at: "2026-01-01", updated_at: "2026-01-01"
    });
    const repositories = createNotificationSchedulerRepositories(db as unknown as D1Database);
    const crashClaim = "2026-08-13T11:49:59.000Z";
    await repositories.deliveries.claim({
      id: "crashed-delivery", userId: "user-1", householdId: "house-1",
      notificationType: "task", targetKey: "task-1:2026-08-13:21:00", now: crashClaim
    });
    const sent: string[] = [];
    const service = new NotificationSchedulerService(db as unknown as D1Database, {
      sendPayload: (userId, householdId) => {
        sent.push(`${userId}:${householdId}`);
        return Promise.resolve({ sent: 1, failed: 0 });
      }
    });

    await service.run({}, new Date("2026-08-13T12:00:00.000Z"));

    expect(sent).toEqual(["user-1:house-1"]);
    expect(Array.from(db.notificationDeliveries.values())).toMatchObject([
      { status: "sent", sent_at: "2026-08-13T12:00:00.000Z" }
    ]);
  });
});
