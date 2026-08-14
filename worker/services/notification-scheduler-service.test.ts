import { describe, expect, it } from "vitest";
import { getLocalDate, getLocalTime } from "../lib/date-time";
import { createNotificationSchedulerRepositories } from "../repositories/notification-scheduler-repository";
import { MemoryD1 } from "../test-utils/memory-d1";
import {
  isIncomplete,
  isTaskDueToday,
  NOTIFICATION_DELIVERY_WINDOW_MINUTES,
  NotificationSchedulerService,
  resolveCanonicalNotifications,
  resolveScheduledNotification
} from "./notification-scheduler-service";
import type { Task } from "../types/domain";

const task = (overrides: Partial<Task> = {}): Task => ({
  id: "task-1", householdId: "house-1", title: "掃除", description: null,
  recurrenceType: "daily", assignmentType: "anyone", assignedUserId: null,
  scheduledTime: null, notificationSlot: "none", notificationTime: "21:00",
  weeklyTargetCount: null, active: true, sortOrder: 1, createdBy: "user-1",
  createdAt: "2026-01-01", updatedAt: "2026-01-01", weekdays: [], ...overrides
});

const schedulerDb = (notificationTime: string | null): MemoryD1 => {
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
    scheduled_time: null, notification_slot: "none", notification_time: notificationTime,
    weekly_target_count: null, active: 1, sort_order: 1, created_by: "user-1",
    created_at: "2026-01-01", updated_at: "2026-01-01"
  });
  return db;
};

const canonicalTask = (overrides: Partial<Task> = {}): Task => task({
  recurrenceType: "daily",
  modelRecurrenceType: "daily",
  notificationTime: "18:00",
  startDate: "2026-01-01",
  deadlineTime: "18:00",
  notificationOffsetMinutes: 0,
  ...overrides
});

const addCanonicalTask = (db: MemoryD1, overrides: Record<string, unknown> = {}) => {
  db.tasks.set("task-1", {
    id: "task-1", household_id: "house-1", title: "Task", description: null,
    recurrence_type: "daily", model_recurrence_type: "daily", assignment_type: "anyone", assigned_user_id: null,
    scheduled_time: null, notification_slot: "none", notification_time: "18:00",
    weekly_target_count: null, start_date: "2026-01-01", target_date: null,
    deadline_time: "18:00", notification_offset_minutes: 0, weekly_deadline_weekday: null,
    monthly_day_of_month: null, monthly_deadline_type: null, active: 1, sort_order: 1, created_by: "user-1",
    created_at: "2026-01-01", updated_at: "2026-01-01", ...overrides
  });
};

describe("notification scheduler rules", () => {
  it("uses a 20-minute half-open delivery window", () => {
    const at = (time: string) => new Date(`2026-08-12T${time}:00.000Z`);
    expect(resolveScheduledNotification(at("22:29"), "Asia/Tokyo", "07:30")).toBeNull();
    expect(resolveScheduledNotification(at("22:30"), "Asia/Tokyo", "07:30")).toMatchObject({ scheduledDate: "2026-08-13" });
    expect(resolveScheduledNotification(at("22:49"), "Asia/Tokyo", "07:30")).toMatchObject({ scheduledDate: "2026-08-13" });
    expect(resolveScheduledNotification(at("22:50"), "Asia/Tokyo", "07:30")).toBeNull();
    expect(NOTIFICATION_DELIVERY_WINDOW_MINUTES).toBe(20);
  });

  it("uses the previous scheduled date across midnight", () => {
    expect(resolveScheduledNotification(new Date("2026-08-13T15:05:00.000Z"), "Asia/Tokyo", "23:55")).toEqual({
      scheduledDate: "2026-08-13",
      scheduledTime: "23:55"
    });
    expect(resolveScheduledNotification(new Date("2026-08-13T15:15:00.000Z"), "Asia/Tokyo", "23:55")).toBeNull();
  });

  it("keeps date/time resolution stable for a DST timezone", () => {
    expect(resolveScheduledNotification(new Date("2026-03-08T07:05:00.000Z"), "America/New_York", "03:00")).toMatchObject({
      scheduledDate: "2026-03-08"
    });
  });

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

  it("resolves canonical fixed reminders from the shared scope resolver", () => {
    const dailyAt = new Date("2026-08-19T09:00:00.000Z");
    expect(resolveCanonicalNotifications(canonicalTask(), dailyAt, "Asia/Tokyo")).toHaveLength(1);
    expect(resolveCanonicalNotifications(canonicalTask({ notificationOffsetMinutes: 30 }), new Date("2026-08-19T08:30:00.000Z"), "Asia/Tokyo")).toHaveLength(1);
    expect(resolveCanonicalNotifications(canonicalTask({
      recurrenceType: "scheduled", modelRecurrenceType: "weekly_fixed", weekdays: [3],
      deadlineTime: "18:00", notificationOffsetMinutes: 60
    }), new Date("2026-08-19T08:00:00.000Z"), "Asia/Tokyo")[0]?.scope.occurrenceKey)
      .toBe("occurrence:task-1:2026-08-19");
    expect(resolveCanonicalNotifications(canonicalTask({
      recurrenceType: "model_only", modelRecurrenceType: "monthly_fixed", monthlyDayOfMonth: 31,
      deadlineTime: "21:00"
    }), new Date("2026-02-28T12:00:00.000Z"), "Asia/Tokyo")[0]?.scope.deadlineDate)
      .toBe("2026-02-28");
    expect(resolveCanonicalNotifications(canonicalTask({
      recurrenceType: "model_only", modelRecurrenceType: "once", targetDate: "2026-08-20"
    }), new Date("2026-08-20T09:00:00.000Z"), "Asia/Tokyo")[0]?.targetKey)
      .toBe("task:occurrence:task-1:2026-08-20");
  });

  it("resolves flexible reminders and preserves stable period keys", () => {
    const weekly = canonicalTask({
      recurrenceType: "weekly", modelRecurrenceType: "weekly_flexible", weeklyDeadlineWeekday: 0,
      deadlineTime: "21:00", notificationOffsetMinutes: 30
    });
    const monthly = canonicalTask({
      recurrenceType: "model_only", modelRecurrenceType: "monthly_flexible", monthlyDeadlineType: "month_end",
      deadlineTime: "21:00", notificationOffsetMinutes: 60
    });
    expect(resolveCanonicalNotifications(weekly, new Date("2026-08-23T11:30:00.000Z"), "Asia/Tokyo")[0]?.targetKey)
      .toContain("task:period:task-1:week:");
    expect(resolveCanonicalNotifications(monthly, new Date("2026-08-31T11:00:00.000Z"), "Asia/Tokyo")[0]?.targetKey)
      .toContain("task:period:task-1:month:");
  });

  it("handles previous-day offsets, start dates, and household timezone boundaries", () => {
    const rollover = canonicalTask({ deadlineTime: "00:30", notificationOffsetMinutes: 60 });
    const resolved = resolveCanonicalNotifications(rollover, new Date("2026-08-19T14:30:00.000Z"), "Asia/Tokyo")[0];
    expect(resolved).toMatchObject({ scheduledDate: "2026-08-19", scheduledTime: "23:30" });
    expect(resolved.scope.deadlineDate).toBe("2026-08-20");
    expect(resolveCanonicalNotifications(canonicalTask({ startDate: "2026-08-21" }), new Date("2026-08-20T09:00:00.000Z"), "Asia/Tokyo")).toEqual([]);
    expect(resolveCanonicalNotifications(canonicalTask({ deadlineTime: "03:00" }), new Date("2026-03-08T07:05:00.000Z"), "America/New_York")).toHaveLength(1);
    expect(resolveCanonicalNotifications(canonicalTask({ deadlineTime: "23:55" }), new Date("2026-08-13T15:05:00.000Z"), "Asia/Tokyo")[0]?.scope.deadlineDate)
      .toBe("2026-08-13");
  });

  it("requires both canonical deadline and notification preset", () => {
    const at = new Date("2026-08-19T09:00:00.000Z");
    expect(resolveCanonicalNotifications(canonicalTask({ deadlineTime: null }), at, "Asia/Tokyo")).toEqual([]);
    expect(resolveCanonicalNotifications(canonicalTask({ notificationOffsetMinutes: null }), at, "Asia/Tokyo")).toEqual([]);
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
      recurrence_type: "daily", model_recurrence_type: "daily", assignment_type: "anyone", assigned_user_id: null,
      scheduled_time: null, notification_slot: "none", notification_time: "21:00",
      weekly_target_count: null, start_date: "2026-01-01", deadline_time: "21:00", notification_offset_minutes: 0,
      active: 1, sort_order: 1, created_by: "user-1",
      created_at: "2026-01-01", updated_at: "2026-01-01"
    });
    const repositories = createNotificationSchedulerRepositories(db as unknown as D1Database);
    const crashClaim = "2026-08-13T12:00:00.000Z";
    await repositories.deliveries.claim({
      id: "crashed-delivery", userId: "user-1", householdId: "house-1",
      notificationType: "task", targetKey: "task:occurrence:task-1:2026-08-13", now: crashClaim
    });
    const sent: string[] = [];
    const service = new NotificationSchedulerService(db as unknown as D1Database, {
      sendPayload: (userId, householdId) => {
        sent.push(`${userId}:${householdId}`);
        return Promise.resolve({ sent: 1, failed: 0 });
      }
    });

    await service.run({}, new Date("2026-08-13T12:05:00.000Z"));
    expect(sent).toEqual([]);
    await service.run({}, new Date("2026-08-13T12:10:01.000Z"));

    expect(sent).toEqual(["user-1:house-1"]);
    expect(Array.from(db.notificationDeliveries.values())).toMatchObject([
      { status: "sent", sent_at: "2026-08-13T12:10:01.000Z" }
    ]);
  });

  it("retries a failed task delivery on the next window run", async () => {
    const db = schedulerDb(null);
    addCanonicalTask(db, { deadline_time: "21:00", notification_offset_minutes: 0, notification_time: "21:00" });
    const repositories = createNotificationSchedulerRepositories(db as unknown as D1Database);
    let attempts = 0;
    const service = new NotificationSchedulerService(db as unknown as D1Database, {
      sendPayload: () => {
        attempts += 1;
        return Promise.resolve(attempts === 1 ? { sent: 0, failed: 1 } : { sent: 1, failed: 0 });
      }
    });

    await service.run({}, new Date("2026-08-13T12:00:00.000Z"));
    await service.run({}, new Date("2026-08-13T12:05:00.000Z"));

    expect(attempts).toBe(2);
    expect(Array.from(db.notificationDeliveries.values())).toMatchObject([{ status: "sent" }]);
    expect(repositories.deliveries).toBeDefined();
  });

  it("honors pre-scope-key completion records on migrated canonical tasks", async () => {
    const db = schedulerDb(null);
    addCanonicalTask(db, { deadline_time: "21:00", notification_offset_minutes: 0 });
    db.taskRecords.set("record-1", {
      id: "record-1", household_id: "house-1", task_id: "task-1", target_date: "2026-08-13", target_week_start: null,
      occurrence_key: null, period_key: null, status: "completed", acted_by: "user-1", started_at: null,
      completed_at: "2026-08-13T11:00:00.000Z", skipped_at: null, note: null,
      created_at: "2026-08-13T11:00:00.000Z", updated_at: "2026-08-13T11:00:00.000Z"
    });
    let sends = 0;
    await new NotificationSchedulerService(db as unknown as D1Database, {
      sendPayload: () => { sends += 1; return Promise.resolve({ sent: 1, failed: 0 }); }
    }).run({}, new Date("2026-08-13T12:00:00.000Z"));
    expect(sends).toBe(0);
  });

  it("uses canonical records for completion and skip eligibility without legacy double-send", async () => {
    for (const status of [undefined, "completed", "skipped"] as const) {
      const db = schedulerDb(null);
      addCanonicalTask(db, {
        recurrence_type: "weekly", model_recurrence_type: "weekly_flexible", notification_time: "21:00",
        deadline_time: "21:00", notification_offset_minutes: 0, weekly_deadline_weekday: 4
      });
      if (status) db.taskRecords.set("record-1", {
        id: "record-1", household_id: "house-1", task_id: "task-1", target_date: null, target_week_start: null,
        occurrence_key: null, period_key: "period:task-1:week:2026-08-07:2026-08-13", status, acted_by: "user-1",
        started_at: null, completed_at: status === "completed" ? "2026-08-13T10:00:00.000Z" : null,
        skipped_at: status === "skipped" ? "2026-08-13T10:00:00.000Z" : null, note: null,
        created_at: "2026-08-13T10:00:00.000Z", updated_at: "2026-08-13T10:00:00.000Z"
      });
      let sends = 0;
      const service = new NotificationSchedulerService(db as unknown as D1Database, {
        sendPayload: () => { sends += 1; return Promise.resolve({ sent: 1, failed: 0 }); }
      });
      await service.run({}, new Date("2026-08-13T12:00:00.000Z"));
      expect(sends).toBe(status ? 0 : 1);
      if (!status) {
        expect(Array.from(db.notificationDeliveries.values())[0]?.target_key).toBe("task:period:task-1:week:2026-08-07:2026-08-13");
        await service.run({}, new Date("2026-08-13T12:05:00.000Z"));
        expect(sends).toBe(1);
      }
    }
  });

  it("suppresses completed monthly flexible periods", async () => {
    const db = schedulerDb(null);
    addCanonicalTask(db, {
      recurrence_type: "model_only", model_recurrence_type: "monthly_flexible", notification_time: null,
      deadline_time: "21:00", notification_offset_minutes: 0, monthly_deadline_type: "month_end"
    });
    db.taskRecords.set("record-1", {
      id: "record-1", household_id: "house-1", task_id: "task-1", target_date: null, target_week_start: null,
      occurrence_key: null, period_key: "period:task-1:month:2026-08-01:2026-08-31", status: "completed", acted_by: "user-1",
      started_at: null, completed_at: "2026-08-30T10:00:00.000Z", skipped_at: null, note: null,
      created_at: "2026-08-30T10:00:00.000Z", updated_at: "2026-08-30T10:00:00.000Z"
    });
    let sends = 0;
    await new NotificationSchedulerService(db as unknown as D1Database, {
      sendPayload: () => { sends += 1; return Promise.resolve({ sent: 1, failed: 0 }); }
    }).run({}, new Date("2026-08-31T12:00:00.000Z"));
    expect(sends).toBe(0);
  });

  it("deduplicates evening summary retries and skips disabled or empty summaries", async () => {
    const db = schedulerDb(null);
    db.notificationSettings.set("house-1:user-1", {
      user_id: "user-1", household_id: "house-1", evening_summary_enabled: 1,
      evening_summary_time: "21:00", timezone: "Asia/Tokyo", updated_at: "2026-01-01"
    });
    let attempts = 0;
    const service = new NotificationSchedulerService(db as unknown as D1Database, {
      sendPayload: () => {
        attempts += 1;
        return Promise.resolve(attempts === 1 ? { sent: 0, failed: 1 } : { sent: 1, failed: 0 });
      }
    });

    await service.run({}, new Date("2026-08-13T12:00:00.000Z"));
    await service.run({}, new Date("2026-08-13T12:05:00.000Z"));
    await service.run({}, new Date("2026-08-13T12:10:00.000Z"));
    expect(attempts).toBe(2);

    db.notificationSettings.get("house-1:user-1")!.evening_summary_enabled = 0;
    await service.run({}, new Date("2026-08-13T12:15:00.000Z"));
    expect(attempts).toBe(2);
  });

  it("does not send an evening summary when all tasks are complete", async () => {
    const db = schedulerDb(null);
    db.notificationSettings.set("house-1:user-1", {
      user_id: "user-1", household_id: "house-1", evening_summary_enabled: 1,
      evening_summary_time: "21:00", timezone: "Asia/Tokyo", updated_at: "2026-01-01"
    });
    db.taskRecords.set("record-1", {
      id: "record-1", household_id: "house-1", task_id: "task-1", target_date: "2026-08-13",
      target_week_start: null, status: "completed", acted_by: "user-1", started_at: null,
      completed_at: "2026-08-13T11:00:00.000Z", skipped_at: null, note: null,
      created_at: "2026-08-13T11:00:00.000Z", updated_at: "2026-08-13T11:00:00.000Z"
    });
    let attempts = 0;
    const service = new NotificationSchedulerService(db as unknown as D1Database, {
      sendPayload: () => {
        attempts += 1;
        return Promise.resolve({ sent: 1, failed: 0 });
      }
    });

    await service.run({}, new Date("2026-08-13T12:00:00.000Z"));

    expect(attempts).toBe(0);
  });

  it("keeps the previous scheduled date in the midnight target key", async () => {
    const db = schedulerDb("23:55");
    const service = new NotificationSchedulerService(db as unknown as D1Database, {
      sendPayload: () => Promise.resolve({ sent: 1, failed: 0 })
    });

    await service.run({}, new Date("2026-08-13T15:05:00.000Z"));

    expect(Array.from(db.notificationDeliveries.values())[0]?.target_key)
      .toBe("task-1:2026-08-13:23:55");
  });
});
