import { describe, expect, it } from "vitest";
import { getLocalDate, getLocalTime } from "../lib/date-time";
import { createNotificationSchedulerRepositories } from "../repositories/notification-scheduler-repository";
import { MemoryD1 } from "../test-utils/memory-d1";
import { TaskService } from "./task-service";
import {
  formatRemainingTaskTitles,
  isIncomplete,
  isTaskDueToday,
  NOTIFICATION_DELIVERY_WINDOW_MINUTES,
  NotificationSchedulerService,
  resolveCanonicalNotifications,
  resolveScheduledNotification
} from "./notification-scheduler-service";
import type { Task } from "../types/domain";

const task = (overrides: Partial<Task> = {}): Task => ({
  id: "task-1",
  householdId: "house-1",
  title: "掃除",
  description: null,
  recurrenceType: "daily",
  assignmentType: "anyone",
  assignedUserId: null,
  scheduledTime: null,
  notificationSlot: "none",
  notificationTime: "21:00",
  weeklyTargetCount: null,
  active: true,
  sortOrder: 1,
  createdBy: "user-1",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  weekdays: [],
  ...overrides
});

const schedulerDb = (notificationTime: string | null): MemoryD1 => {
  const db = new MemoryD1();
  db.households.set("house-1", {
    id: "house-1",
    name: "House",
    timezone: "Asia/Tokyo",
    week_starts_on: 1,
    created_by: "user-1",
    created_at: "2026-01-01",
    updated_at: "2026-01-01"
  });
  db.users.set("user-1", {
    id: "user-1",
    email: "test@example.com",
    password_hash: "hash",
    display_name: "Test",
    created_at: "2026-01-01",
    updated_at: "2026-01-01"
  });
  db.members.set("house-1:user-1", {
    household_id: "house-1",
    user_id: "user-1",
    role: "owner",
    color: null,
    joined_at: "2026-01-01"
  });
  db.tasks.set("task-1", {
    id: "task-1",
    household_id: "house-1",
    title: "Task",
    description: null,
    recurrence_type: "daily",
    assignment_type: "anyone",
    assigned_user_id: null,
    scheduled_time: null,
    notification_slot: "none",
    notification_time: notificationTime,
    weekly_target_count: null,
    active: 1,
    sort_order: 1,
    created_by: "user-1",
    created_at: "2026-01-01",
    updated_at: "2026-01-01"
  });
  return db;
};

const canonicalTask = (overrides: Partial<Task> = {}): Task =>
  task({
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
    id: "task-1",
    household_id: "house-1",
    title: "Task",
    description: null,
    recurrence_type: "daily",
    model_recurrence_type: "daily",
    assignment_type: "anyone",
    assigned_user_id: null,
    scheduled_time: null,
    notification_slot: "none",
    notification_time: "18:00",
    weekly_target_count: null,
    start_date: "2026-01-01",
    target_date: null,
    deadline_time: "18:00",
    notification_offset_minutes: 0,
    weekly_deadline_weekday: null,
    monthly_day_of_month: null,
    monthly_deadline_type: null,
    active: 1,
    sort_order: 1,
    created_by: "user-1",
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    ...overrides
  });
};

const addSummaryTask = (
  db: MemoryD1,
  input: {
    id: string;
    householdId?: string;
    title: string;
    sortOrder: number;
    active?: number;
    recurrenceType?: Task["recurrenceType"];
    modelRecurrenceType?: Task["modelRecurrenceType"];
    targetDate?: string | null;
    weekdays?: number[];
    startDate?: string | null;
    deadlineTime?: string | null;
    weeklyDeadlineWeekday?: number | null;
    monthlyDayOfMonth?: number | null;
    monthlyDeadlineType?: Task["monthlyDeadlineType"];
    assignmentType?: Task["assignmentType"];
    assignedUserId?: string | null;
  }
) => {
  db.tasks.set(input.id, {
    id: input.id,
    household_id: input.householdId ?? "house-1",
    title: input.title,
    description: null,
    recurrence_type: input.recurrenceType ?? "daily",
    model_recurrence_type: input.modelRecurrenceType,
    assignment_type: input.assignmentType ?? "anyone",
    assigned_user_id: input.assignedUserId ?? null,
    scheduled_time: null,
    notification_slot: "none",
    notification_time: null,
    weekly_target_count: null,
    start_date: input.startDate ?? "2026-01-01",
    target_date: input.targetDate ?? null,
    deadline_time: input.deadlineTime ?? null,
    notification_offset_minutes: null,
    weekly_deadline_weekday: input.weeklyDeadlineWeekday ?? null,
    monthly_day_of_month: input.monthlyDayOfMonth ?? null,
    monthly_deadline_type: input.monthlyDeadlineType ?? null,
    active: input.active ?? 1,
    sort_order: input.sortOrder,
    created_by: "user-1",
    created_at: "2026-01-01",
    updated_at: "2026-01-01"
  });
  for (const weekday of input.weekdays ?? []) {
    db.taskWeekdays.set(`${input.id}:${weekday}`, {
      task_id: input.id,
      weekday
    });
  }
};

describe("notification scheduler rules", () => {
  it("uses a 20-minute half-open delivery window", () => {
    const at = (time: string) => new Date(`2026-08-12T${time}:00.000Z`);
    expect(resolveScheduledNotification(at("22:29"), "Asia/Tokyo", "07:30")).toBeNull();
    expect(
      resolveScheduledNotification(at("22:30"), "Asia/Tokyo", "07:30")
    ).toMatchObject({ scheduledDate: "2026-08-13" });
    expect(
      resolveScheduledNotification(at("22:49"), "Asia/Tokyo", "07:30")
    ).toMatchObject({ scheduledDate: "2026-08-13" });
    expect(resolveScheduledNotification(at("22:50"), "Asia/Tokyo", "07:30")).toBeNull();
    expect(NOTIFICATION_DELIVERY_WINDOW_MINUTES).toBe(20);
  });

  it("uses the previous scheduled date across midnight", () => {
    expect(
      resolveScheduledNotification(
        new Date("2026-08-13T15:05:00.000Z"),
        "Asia/Tokyo",
        "23:55"
      )
    ).toEqual({
      scheduledDate: "2026-08-13",
      scheduledTime: "23:55"
    });
    expect(
      resolveScheduledNotification(
        new Date("2026-08-13T15:15:00.000Z"),
        "Asia/Tokyo",
        "23:55"
      )
    ).toBeNull();
  });

  it("keeps date/time resolution stable for a DST timezone", () => {
    expect(
      resolveScheduledNotification(
        new Date("2026-03-08T07:05:00.000Z"),
        "America/New_York",
        "03:00"
      )
    ).toMatchObject({
      scheduledDate: "2026-03-08"
    });
  });

  it("selects daily and matching scheduled tasks, excluding weekly", () => {
    expect(isTaskDueToday(task(), "2026-08-13")).toBe(true);
    expect(
      isTaskDueToday(task({ recurrenceType: "scheduled", weekdays: [4] }), "2026-08-13")
    ).toBe(true);
    expect(
      isTaskDueToday(task({ recurrenceType: "scheduled", weekdays: [5] }), "2026-08-13")
    ).toBe(false);
    expect(isTaskDueToday(task({ recurrenceType: "weekly" }), "2026-08-13")).toBe(
      false
    );
  });

  it("only treats open task records as incomplete", () => {
    expect(isIncomplete(undefined)).toBe(true);
    expect(isIncomplete("in_progress")).toBe(true);
    expect(isIncomplete("completed")).toBe(false);
    expect(isIncomplete("skipped")).toBe(false);
  });

  it("formats one, three, and many remaining task titles deterministically", () => {
    expect(formatRemainingTaskTitles([{ title: "  ゴミ出し  " }])).toBe("ゴミ出し");
    expect(
      formatRemainingTaskTitles([
        { title: "ゴミ出し" },
        { title: "食器\n洗い" },
        { title: "インコの餌交換" }
      ])
    ).toBe("ゴミ出し・食器 洗い・インコの餌交換");
    expect(
      formatRemainingTaskTitles([
        { title: "ゴミ出し" },
        { title: "食器洗い" },
        { title: "インコの餌交換" },
        { title: "風呂掃除" },
        { title: "床掃除" }
      ])
    ).toBe("ゴミ出し・食器洗い・インコの餌交換・ほか2件");
  });

  it("uses Home's actionable projection for summary eligibility and body titles", async () => {
    const db = schedulerDb(null);
    db.tasks.clear();
    addSummaryTask(db, { id: "task-1", title: "ゴミ出し", sortOrder: 1 });
    addSummaryTask(db, { id: "task-2", title: "食器洗い", sortOrder: 2 });
    addSummaryTask(db, { id: "task-3", title: "インコの餌交換", sortOrder: 3 });
    addSummaryTask(db, { id: "task-4", title: "完了済み", sortOrder: 4 });
    addSummaryTask(db, { id: "task-5", title: "スキップ済み", sortOrder: 5 });
    addSummaryTask(db, { id: "task-6", title: "無効", sortOrder: 6, active: 0 });
    db.taskRecords.set("record-completed", {
      id: "record-completed",
      household_id: "house-1",
      task_id: "task-4",
      target_date: "2026-08-13",
      target_week_start: null,
      status: "completed",
      acted_by: "user-1",
      started_at: null,
      completed_at: "2026-08-13T01:00:00.000Z",
      skipped_at: null,
      note: null,
      created_at: "2026-08-13T01:00:00.000Z",
      updated_at: "2026-08-13T01:00:00.000Z"
    });
    db.taskRecords.set("record-skipped", {
      id: "record-skipped",
      household_id: "house-1",
      task_id: "task-5",
      target_date: "2026-08-13",
      target_week_start: null,
      status: "skipped",
      acted_by: "user-1",
      started_at: null,
      completed_at: null,
      skipped_at: "2026-08-13T01:00:00.000Z",
      note: null,
      created_at: "2026-08-13T01:00:00.000Z",
      updated_at: "2026-08-13T01:00:00.000Z"
    });
    db.notificationSettings.set("house-1:user-1", {
      user_id: "user-1",
      household_id: "house-1",
      morning_summary_enabled: 1,
      morning_summary_time: "09:00",
      evening_summary_enabled: 0,
      evening_summary_time: "21:00",
      timezone: "Asia/Tokyo",
      updated_at: "2026-01-01"
    });
    const payloads: Record<string, unknown>[] = [];
    const service = new NotificationSchedulerService(db as unknown as D1Database, {
      sendPayload: (_userId, _householdId, payload) => {
        payloads.push(payload as Record<string, unknown>);
        return Promise.resolve({ sent: 1, failed: 0 });
      }
    });

    const home = await new TaskService(db as unknown as D1Database).listHomeForHousehold(
      {
        id: "house-1",
        name: "House",
        timezone: "Asia/Tokyo",
        weekStartsOn: 1,
        createdBy: "user-1",
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01",
        role: "owner"
      },
      "2026-08-13"
    );
    await service.run({}, new Date("2026-08-13T00:05:00.000Z"));

    expect(home.tasks.map((task) => task.id)).toEqual(["task-1", "task-2", "task-3"]);
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({
      title: "朝の家事が3件残っています",
      body: "ゴミ出し・食器洗い・インコの餌交換",
      data: {
        kind: "summary",
        period: "morning",
        localDate: "2026-08-13",
        url: "/home"
      }
    });
    expect(payloads[0].body).toBe(formatRemainingTaskTitles(home.tasks));
  });

  it("supports all canonical recurrence types through the Home projection", async () => {
    const db = schedulerDb(null);
    db.tasks.clear();
    addSummaryTask(db, {
      id: "once",
      title: "一度だけ",
      sortOrder: 1,
      recurrenceType: "model_only",
      modelRecurrenceType: "once",
      targetDate: "2026-08-13"
    });
    addSummaryTask(db, {
      id: "daily",
      title: "毎日",
      sortOrder: 2,
      modelRecurrenceType: "daily"
    });
    addSummaryTask(db, {
      id: "weekly-fixed",
      title: "毎週固定",
      sortOrder: 3,
      recurrenceType: "model_only",
      modelRecurrenceType: "weekly_fixed",
      weekdays: [4]
    });
    addSummaryTask(db, {
      id: "monthly-fixed",
      title: "毎月固定",
      sortOrder: 4,
      recurrenceType: "model_only",
      modelRecurrenceType: "monthly_fixed",
      monthlyDayOfMonth: 13
    });
    addSummaryTask(db, {
      id: "weekly-flexible",
      title: "週内柔軟",
      sortOrder: 5,
      recurrenceType: "weekly",
      modelRecurrenceType: "weekly_flexible",
      weeklyDeadlineWeekday: 4
    });
    addSummaryTask(db, {
      id: "monthly-flexible",
      title: "月内柔軟",
      sortOrder: 6,
      recurrenceType: "model_only",
      modelRecurrenceType: "monthly_flexible",
      monthlyDeadlineType: "month_end"
    });
    db.notificationSettings.set("house-1:user-1", {
      user_id: "user-1",
      household_id: "house-1",
      morning_summary_enabled: 1,
      morning_summary_time: "09:00",
      evening_summary_enabled: 0,
      evening_summary_time: "21:00",
      timezone: "Asia/Tokyo",
      updated_at: "2026-01-01"
    });
    const payloads: Record<string, unknown>[] = [];
    await new NotificationSchedulerService(db as unknown as D1Database, {
      sendPayload: (_userId, _householdId, payload) => {
        payloads.push(payload as Record<string, unknown>);
        return Promise.resolve({ sent: 1, failed: 0 });
      }
    }).run({}, new Date("2026-08-13T00:05:00.000Z"));

    expect(payloads[0]).toMatchObject({
      title: "朝の家事が6件残っています",
      body: "一度だけ・毎日・毎週固定・ほか3件"
    });
  });

  it("keeps task-specific payloads distinct from summary payloads", async () => {
    const legacyDb = schedulerDb("07:45");
    const legacyPayloads: Record<string, unknown>[] = [];
    await new NotificationSchedulerService(legacyDb as unknown as D1Database, {
      sendPayload: (_userId, _householdId, payload) => {
        legacyPayloads.push(payload as Record<string, unknown>);
        return Promise.resolve({ sent: 1, failed: 0 });
      }
    }).run({}, new Date("2026-08-12T22:45:00.000Z"));

    expect(legacyPayloads[0]).toEqual({
      title: "家事の時間です",
      body: "Task",
      icon: "/icons/house-todo-v4-192.png",
      data: { kind: "task", taskId: "task-1", url: "/home?task=task-1" }
    });
    expect(legacyPayloads[0].body).not.toContain("・");

    const canonicalDb = schedulerDb(null);
    addCanonicalTask(canonicalDb, {
      notification_time: null,
      deadline_time: "08:00",
      notification_offset_minutes: 15
    });
    const canonicalPayloads: Record<string, unknown>[] = [];
    await new NotificationSchedulerService(canonicalDb as unknown as D1Database, {
      sendPayload: (_userId, _householdId, payload) => {
        canonicalPayloads.push(payload as Record<string, unknown>);
        return Promise.resolve({ sent: 1, failed: 0 });
      }
    }).run({}, new Date("2026-08-12T22:45:00.000Z"));

    expect(canonicalPayloads[0]).toMatchObject({
      title: "家事の時間です",
      body: "Task",
      data: { kind: "task", taskId: "task-1", url: "/home?task=task-1" }
    });
    expect(canonicalPayloads[0].body).not.toBe(
      formatRemainingTaskTitles([{ title: "Task" }, { title: "別の家事" }])
    );
  });

  it("delivers canonical reminders at the configured deadline minus offset", async () => {
    const db = schedulerDb(null);
    addCanonicalTask(db, {
      notification_time: null,
      deadline_time: "08:00",
      notification_offset_minutes: 15
    });
    let attempts = 0;
    const service = new NotificationSchedulerService(db as unknown as D1Database, {
      sendPayload: () => {
        attempts += 1;
        return Promise.resolve({ sent: 1, failed: 0 });
      }
    });

    await service.run({}, new Date("2026-08-12T22:44:00.000Z"));
    expect(attempts).toBe(0);
    await service.run({}, new Date("2026-08-12T22:45:00.000Z"));
    expect(attempts).toBe(1);
    await service.run({}, new Date("2026-08-12T22:50:00.000Z"));
    expect(attempts).toBe(1);
  });

  it("delivers zero-offset and non-five-minute canonical reminder times", async () => {
    const zeroOffsetDb = schedulerDb(null);
    addCanonicalTask(zeroOffsetDb, {
      notification_time: null,
      deadline_time: "08:00",
      notification_offset_minutes: 0
    });
    let zeroOffsetAttempts = 0;
    const zeroOffsetService = new NotificationSchedulerService(
      zeroOffsetDb as unknown as D1Database,
      {
        sendPayload: () => {
          zeroOffsetAttempts += 1;
          return Promise.resolve({ sent: 1, failed: 0 });
        }
      }
    );
    await zeroOffsetService.run({}, new Date("2026-08-12T22:59:00.000Z"));
    await zeroOffsetService.run({}, new Date("2026-08-12T23:00:00.000Z"));
    expect(zeroOffsetAttempts).toBe(1);

    const nonFiveMinuteDb = schedulerDb(null);
    addCanonicalTask(nonFiveMinuteDb, {
      notification_time: null,
      deadline_time: "08:07",
      notification_offset_minutes: 0
    });
    let nonFiveMinuteAttempts = 0;
    const nonFiveMinuteService = new NotificationSchedulerService(
      nonFiveMinuteDb as unknown as D1Database,
      {
        sendPayload: () => {
          nonFiveMinuteAttempts += 1;
          return Promise.resolve({ sent: 1, failed: 0 });
        }
      }
    );
    await nonFiveMinuteService.run({}, new Date("2026-08-12T23:05:00.000Z"));
    expect(nonFiveMinuteAttempts).toBe(0);
    await nonFiveMinuteService.run({}, new Date("2026-08-12T23:07:00.000Z"));
    expect(nonFiveMinuteAttempts).toBe(1);
  });

  it("suppresses task-specific reminders for completed or skipped occurrences", async () => {
    for (const status of ["completed", "skipped", undefined] as const) {
      const db = schedulerDb(null);
      addCanonicalTask(db, {
        notification_time: null,
        deadline_time: "08:00",
        notification_offset_minutes: 0
      });
      if (status) {
        db.taskRecords.set(`record-${status}`, {
          id: `record-${status}`,
          household_id: "house-1",
          task_id: "task-1",
          target_date: "2026-08-13",
          target_week_start: null,
          status,
          acted_by: "user-1",
          started_at: null,
          completed_at: status === "completed" ? "2026-08-13T01:00:00.000Z" : null,
          skipped_at: status === "skipped" ? "2026-08-13T01:00:00.000Z" : null,
          note: null,
          created_at: "2026-08-13T01:00:00.000Z",
          updated_at: "2026-08-13T01:00:00.000Z"
        });
      }
      let attempts = 0;
      await new NotificationSchedulerService(db as unknown as D1Database, {
        sendPayload: () => {
          attempts += 1;
          return Promise.resolve({ sent: 1, failed: 0 });
        }
      }).run({}, new Date("2026-08-12T23:00:00.000Z"));
      expect(attempts).toBe(status ? 0 : 1);
    }
  });

  it("sends summaries to each enabled household member regardless of task assignment", async () => {
    const db = schedulerDb(null);
    addSummaryTask(db, {
      id: "assigned-task",
      title: "担当家事",
      sortOrder: 1,
      assignmentType: "specific",
      assignedUserId: "user-2"
    });
    db.users.set("user-2", {
      id: "user-2",
      email: "second@example.com",
      password_hash: "hash",
      display_name: "Second",
      created_at: "2026-01-01",
      updated_at: "2026-01-01"
    });
    db.members.set("house-1:user-2", {
      household_id: "house-1",
      user_id: "user-2",
      role: "member",
      color: null,
      joined_at: "2026-01-01"
    });
    for (const userId of ["user-1", "user-2"]) {
      db.notificationSettings.set(`house-1:${userId}`, {
        user_id: userId,
        household_id: "house-1",
        morning_summary_enabled: 1,
        morning_summary_time: "09:00",
        evening_summary_enabled: 0,
        evening_summary_time: "21:00",
        timezone: "Asia/Tokyo",
        updated_at: "2026-01-01"
      });
    }
    const sentUsers: string[] = [];
    await new NotificationSchedulerService(db as unknown as D1Database, {
      sendPayload: (userId) => {
        sentUsers.push(userId);
        return Promise.resolve({ sent: 1, failed: 0 });
      }
    }).run({}, new Date("2026-08-13T00:05:00.000Z"));

    expect(sentUsers).toEqual(["user-1", "user-2"]);
  });

  it("does not retry a summary after a partial device success", async () => {
    const db = schedulerDb(null);
    db.notificationSettings.set("house-1:user-1", {
      user_id: "user-1",
      household_id: "house-1",
      morning_summary_enabled: 1,
      morning_summary_time: "09:00",
      evening_summary_enabled: 0,
      evening_summary_time: "21:00",
      timezone: "Asia/Tokyo",
      updated_at: "2026-01-01"
    });
    let attempts = 0;
    const service = new NotificationSchedulerService(db as unknown as D1Database, {
      sendPayload: () => {
        attempts += 1;
        return Promise.resolve({ sent: 1, failed: 1 });
      }
    });

    await service.run({}, new Date("2026-08-13T00:05:00.000Z"));
    await service.run({}, new Date("2026-08-13T00:10:00.000Z"));

    expect(attempts).toBe(1);
    expect(Array.from(db.notificationDeliveries.values())).toMatchObject([
      { notification_type: "morning_summary", status: "sent" }
    ]);
  });

  it("continues with another household when one household fails", async () => {
    const db = schedulerDb(null);
    db.households.set("house-2", {
      id: "house-2",
      name: "Second House",
      timezone: "Asia/Tokyo",
      week_starts_on: 1,
      created_by: "user-2",
      created_at: "2026-01-01",
      updated_at: "2026-01-01"
    });
    db.users.set("user-2", {
      id: "user-2",
      email: "second@example.com",
      password_hash: "hash",
      display_name: "Second",
      created_at: "2026-01-01",
      updated_at: "2026-01-01"
    });
    db.members.set("house-2:user-2", {
      household_id: "house-2",
      user_id: "user-2",
      role: "owner",
      color: null,
      joined_at: "2026-01-01"
    });
    addSummaryTask(db, {
      id: "task-2",
      householdId: "house-2",
      title: "Second house task",
      sortOrder: 1
    });
    db.notificationSettings.set("house-2:user-2", {
      user_id: "user-2",
      household_id: "house-2",
      morning_summary_enabled: 1,
      morning_summary_time: "09:00",
      evening_summary_enabled: 0,
      evening_summary_time: "21:00",
      timezone: "Asia/Tokyo",
      updated_at: "2026-01-01"
    });
    const repositories = createNotificationSchedulerRepositories(
      db as unknown as D1Database
    );
    const originalList = repositories.tasks.listByHouseholdId.bind(repositories.tasks);
    repositories.tasks.listByHouseholdId = async (householdId, options) => {
      if (householdId === "house-1") throw new Error("household query failed");
      return originalList(householdId, options);
    };
    const sentUsers: string[] = [];
    await new NotificationSchedulerService(
      db as unknown as D1Database,
      {
        sendPayload: (userId) => {
          sentUsers.push(userId);
          return Promise.resolve({ sent: 1, failed: 0 });
        }
      },
      repositories
    ).run({}, new Date("2026-08-13T00:05:00.000Z"));

    expect(sentUsers).toEqual(["user-2"]);
  });

  it("resolves canonical fixed reminders from the shared scope resolver", () => {
    const dailyAt = new Date("2026-08-19T09:00:00.000Z");
    expect(
      resolveCanonicalNotifications(canonicalTask(), dailyAt, "Asia/Tokyo")
    ).toHaveLength(1);
    expect(
      resolveCanonicalNotifications(
        canonicalTask({ notificationOffsetMinutes: 30 }),
        new Date("2026-08-19T08:30:00.000Z"),
        "Asia/Tokyo"
      )
    ).toHaveLength(1);
    expect(
      resolveCanonicalNotifications(
        canonicalTask({
          recurrenceType: "scheduled",
          modelRecurrenceType: "weekly_fixed",
          weekdays: [3],
          deadlineTime: "18:00",
          notificationOffsetMinutes: 60
        }),
        new Date("2026-08-19T08:00:00.000Z"),
        "Asia/Tokyo"
      )[0]?.scope.occurrenceKey
    ).toBe("occurrence:task-1:2026-08-19");
    expect(
      resolveCanonicalNotifications(
        canonicalTask({
          recurrenceType: "model_only",
          modelRecurrenceType: "monthly_fixed",
          monthlyDayOfMonth: 31,
          deadlineTime: "21:00"
        }),
        new Date("2026-02-28T12:00:00.000Z"),
        "Asia/Tokyo"
      )[0]?.scope.deadlineDate
    ).toBe("2026-02-28");
    expect(
      resolveCanonicalNotifications(
        canonicalTask({
          recurrenceType: "model_only",
          modelRecurrenceType: "once",
          targetDate: "2026-08-20"
        }),
        new Date("2026-08-20T09:00:00.000Z"),
        "Asia/Tokyo"
      )[0]?.targetKey
    ).toBe("task:occurrence:task-1:2026-08-20");
  });

  it("resolves flexible reminders and preserves stable period keys", () => {
    const weekly = canonicalTask({
      recurrenceType: "weekly",
      modelRecurrenceType: "weekly_flexible",
      weeklyDeadlineWeekday: 0,
      deadlineTime: "21:00",
      notificationOffsetMinutes: 30
    });
    const monthly = canonicalTask({
      recurrenceType: "model_only",
      modelRecurrenceType: "monthly_flexible",
      monthlyDeadlineType: "month_end",
      deadlineTime: "21:00",
      notificationOffsetMinutes: 60
    });
    expect(
      resolveCanonicalNotifications(
        weekly,
        new Date("2026-08-23T11:30:00.000Z"),
        "Asia/Tokyo"
      )[0]?.targetKey
    ).toContain("task:period:task-1:week:");
    expect(
      resolveCanonicalNotifications(
        monthly,
        new Date("2026-08-31T11:00:00.000Z"),
        "Asia/Tokyo"
      )[0]?.targetKey
    ).toContain("task:period:task-1:month:");
  });

  it("handles previous-day offsets, start dates, and household timezone boundaries", () => {
    const rollover = canonicalTask({
      deadlineTime: "00:30",
      notificationOffsetMinutes: 60
    });
    const resolved = resolveCanonicalNotifications(
      rollover,
      new Date("2026-08-19T14:30:00.000Z"),
      "Asia/Tokyo"
    )[0];
    expect(resolved).toMatchObject({
      scheduledDate: "2026-08-19",
      scheduledTime: "23:30"
    });
    expect(resolved.scope.deadlineDate).toBe("2026-08-20");
    expect(
      resolveCanonicalNotifications(
        canonicalTask({ startDate: "2026-08-21" }),
        new Date("2026-08-20T09:00:00.000Z"),
        "Asia/Tokyo"
      )
    ).toEqual([]);
    expect(
      resolveCanonicalNotifications(
        canonicalTask({ deadlineTime: "03:00" }),
        new Date("2026-03-08T07:05:00.000Z"),
        "America/New_York"
      )
    ).toHaveLength(1);
    expect(
      resolveCanonicalNotifications(
        canonicalTask({ deadlineTime: "23:55" }),
        new Date("2026-08-13T15:05:00.000Z"),
        "Asia/Tokyo"
      )[0]?.scope.deadlineDate
    ).toBe("2026-08-13");
  });

  it("requires both canonical deadline and notification preset", () => {
    const at = new Date("2026-08-19T09:00:00.000Z");
    expect(
      resolveCanonicalNotifications(
        canonicalTask({ deadlineTime: null }),
        at,
        "Asia/Tokyo"
      )
    ).toEqual([]);
    expect(
      resolveCanonicalNotifications(
        canonicalTask({ notificationOffsetMinutes: null }),
        at,
        "Asia/Tokyo"
      )
    ).toEqual([]);
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
      id: "house-1",
      name: "House",
      timezone: "Asia/Tokyo",
      week_starts_on: 1,
      created_by: "user-1",
      created_at: "2026-01-01",
      updated_at: "2026-01-01"
    });
    db.users.set("user-1", {
      id: "user-1",
      email: "test@example.com",
      password_hash: "hash",
      display_name: "Test",
      created_at: "2026-01-01",
      updated_at: "2026-01-01"
    });
    db.members.set("house-1:user-1", {
      household_id: "house-1",
      user_id: "user-1",
      role: "owner",
      color: null,
      joined_at: "2026-01-01"
    });
    db.tasks.set("task-1", {
      id: "task-1",
      household_id: "house-1",
      title: "Task",
      description: null,
      recurrence_type: "daily",
      model_recurrence_type: "daily",
      assignment_type: "anyone",
      assigned_user_id: null,
      scheduled_time: null,
      notification_slot: "none",
      notification_time: "21:00",
      weekly_target_count: null,
      start_date: "2026-01-01",
      deadline_time: "21:00",
      notification_offset_minutes: 0,
      active: 1,
      sort_order: 1,
      created_by: "user-1",
      created_at: "2026-01-01",
      updated_at: "2026-01-01"
    });
    const repositories = createNotificationSchedulerRepositories(
      db as unknown as D1Database
    );
    const crashClaim = "2026-08-13T12:00:00.000Z";
    await repositories.deliveries.claim({
      id: "crashed-delivery",
      userId: "user-1",
      householdId: "house-1",
      notificationType: "task",
      targetKey: "task:occurrence:task-1:2026-08-13",
      now: crashClaim
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
    addCanonicalTask(db, {
      deadline_time: "21:00",
      notification_offset_minutes: 0,
      notification_time: "21:00"
    });
    const repositories = createNotificationSchedulerRepositories(
      db as unknown as D1Database
    );
    let attempts = 0;
    const service = new NotificationSchedulerService(db as unknown as D1Database, {
      sendPayload: () => {
        attempts += 1;
        return Promise.resolve(
          attempts === 1 ? { sent: 0, failed: 1 } : { sent: 1, failed: 0 }
        );
      }
    });

    await service.run({}, new Date("2026-08-13T12:00:00.000Z"));
    await service.run({}, new Date("2026-08-13T12:05:00.000Z"));

    expect(attempts).toBe(2);
    expect(Array.from(db.notificationDeliveries.values())).toMatchObject([
      { status: "sent" }
    ]);
    expect(repositories.deliveries).toBeDefined();
  });

  it("honors pre-scope-key completion records on migrated canonical tasks", async () => {
    const db = schedulerDb(null);
    addCanonicalTask(db, { deadline_time: "21:00", notification_offset_minutes: 0 });
    db.taskRecords.set("record-1", {
      id: "record-1",
      household_id: "house-1",
      task_id: "task-1",
      target_date: "2026-08-13",
      target_week_start: null,
      occurrence_key: null,
      period_key: null,
      status: "completed",
      acted_by: "user-1",
      started_at: null,
      completed_at: "2026-08-13T11:00:00.000Z",
      skipped_at: null,
      note: null,
      created_at: "2026-08-13T11:00:00.000Z",
      updated_at: "2026-08-13T11:00:00.000Z"
    });
    let sends = 0;
    await new NotificationSchedulerService(db as unknown as D1Database, {
      sendPayload: () => {
        sends += 1;
        return Promise.resolve({ sent: 1, failed: 0 });
      }
    }).run({}, new Date("2026-08-13T12:00:00.000Z"));
    expect(sends).toBe(0);
  });

  it("uses canonical records for completion and skip eligibility without legacy double-send", async () => {
    for (const status of [undefined, "completed", "skipped"] as const) {
      const db = schedulerDb(null);
      addCanonicalTask(db, {
        recurrence_type: "weekly",
        model_recurrence_type: "weekly_flexible",
        notification_time: "21:00",
        deadline_time: "21:00",
        notification_offset_minutes: 0,
        weekly_deadline_weekday: 4
      });
      if (status)
        db.taskRecords.set("record-1", {
          id: "record-1",
          household_id: "house-1",
          task_id: "task-1",
          target_date: null,
          target_week_start: null,
          occurrence_key: null,
          period_key: "period:task-1:week:2026-08-07:2026-08-13",
          status,
          acted_by: "user-1",
          started_at: null,
          completed_at: status === "completed" ? "2026-08-13T10:00:00.000Z" : null,
          skipped_at: status === "skipped" ? "2026-08-13T10:00:00.000Z" : null,
          note: null,
          created_at: "2026-08-13T10:00:00.000Z",
          updated_at: "2026-08-13T10:00:00.000Z"
        });
      let sends = 0;
      const service = new NotificationSchedulerService(db as unknown as D1Database, {
        sendPayload: () => {
          sends += 1;
          return Promise.resolve({ sent: 1, failed: 0 });
        }
      });
      await service.run({}, new Date("2026-08-13T12:00:00.000Z"));
      expect(sends).toBe(status ? 0 : 1);
      if (!status) {
        expect(Array.from(db.notificationDeliveries.values())[0]?.target_key).toBe(
          "task:period:task-1:week:2026-08-07:2026-08-13"
        );
        await service.run({}, new Date("2026-08-13T12:05:00.000Z"));
        expect(sends).toBe(1);
      }
    }
  });

  it("suppresses completed monthly flexible periods", async () => {
    const db = schedulerDb(null);
    addCanonicalTask(db, {
      recurrence_type: "model_only",
      model_recurrence_type: "monthly_flexible",
      notification_time: null,
      deadline_time: "21:00",
      notification_offset_minutes: 0,
      monthly_deadline_type: "month_end"
    });
    db.taskRecords.set("record-1", {
      id: "record-1",
      household_id: "house-1",
      task_id: "task-1",
      target_date: null,
      target_week_start: null,
      occurrence_key: null,
      period_key: "period:task-1:month:2026-08-01:2026-08-31",
      status: "completed",
      acted_by: "user-1",
      started_at: null,
      completed_at: "2026-08-30T10:00:00.000Z",
      skipped_at: null,
      note: null,
      created_at: "2026-08-30T10:00:00.000Z",
      updated_at: "2026-08-30T10:00:00.000Z"
    });
    let sends = 0;
    await new NotificationSchedulerService(db as unknown as D1Database, {
      sendPayload: () => {
        sends += 1;
        return Promise.resolve({ sent: 1, failed: 0 });
      }
    }).run({}, new Date("2026-08-31T12:00:00.000Z"));
    expect(sends).toBe(0);
  });

  it("suppresses flexible reminders when a period has multiple completed executions", async () => {
    for (const [
      modelRecurrenceType,
      recurrenceType,
      periodKey,
      deadlineWeekday,
      monthlyDeadlineType
    ] of [
      [
        "weekly_flexible",
        "weekly",
        "period:task-1:week:2026-08-07:2026-08-13",
        4,
        null
      ],
      [
        "monthly_flexible",
        "model_only",
        "period:task-1:month:2026-08-01:2026-08-31",
        null,
        "month_end"
      ]
    ] as const) {
      const db = schedulerDb(null);
      addCanonicalTask(db, {
        recurrence_type: recurrenceType,
        model_recurrence_type: modelRecurrenceType,
        notification_time: "21:00",
        deadline_time: "21:00",
        notification_offset_minutes: 0,
        weekly_deadline_weekday: deadlineWeekday,
        monthly_deadline_type: monthlyDeadlineType
      });
      for (const id of ["record-1", "record-2"]) {
        db.taskRecords.set(id, {
          id,
          household_id: "house-1",
          task_id: "task-1",
          target_date: null,
          target_week_start: null,
          occurrence_key: null,
          period_key: periodKey,
          status: "completed",
          acted_by: "user-1",
          started_at: null,
          completed_at: "2026-08-13T10:00:00.000Z",
          skipped_at: null,
          note: null,
          created_at: "2026-08-13T10:00:00.000Z",
          updated_at: "2026-08-13T10:00:00.000Z"
        });
      }
      let sends = 0;
      await new NotificationSchedulerService(db as unknown as D1Database, {
        sendPayload: () => {
          sends += 1;
          return Promise.resolve({ sent: 1, failed: 0 });
        }
      }).run({}, new Date("2026-08-13T12:00:00.000Z"));
      expect(sends).toBe(0);
    }
  });

  it("deduplicates evening summary retries and skips disabled or empty summaries", async () => {
    const db = schedulerDb(null);
    db.notificationSettings.set("house-1:user-1", {
      user_id: "user-1",
      household_id: "house-1",
      evening_summary_enabled: 1,
      evening_summary_time: "21:00",
      timezone: "Asia/Tokyo",
      updated_at: "2026-01-01"
    });
    let attempts = 0;
    const service = new NotificationSchedulerService(db as unknown as D1Database, {
      sendPayload: () => {
        attempts += 1;
        return Promise.resolve(
          attempts === 1 ? { sent: 0, failed: 1 } : { sent: 1, failed: 0 }
        );
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

  it("deduplicates one morning slot, permits a changed time, and sends on the next date", async () => {
    const db = schedulerDb(null);
    db.notificationSettings.set("house-1:user-1", {
      user_id: "user-1",
      household_id: "house-1",
      morning_summary_enabled: 1,
      morning_summary_time: "09:00",
      evening_summary_enabled: 0,
      evening_summary_time: "21:00",
      timezone: "Asia/Tokyo",
      updated_at: "2026-01-01"
    });
    let attempts = 0;
    const service = new NotificationSchedulerService(db as unknown as D1Database, {
      sendPayload: () => {
        attempts += 1;
        return Promise.resolve({ sent: 1, failed: 0 });
      }
    });

    await service.run({}, new Date("2026-09-02T00:00:00.000Z"));
    await service.run({}, new Date("2026-09-02T00:05:00.000Z"));
    expect(attempts).toBe(1);
    db.notificationSettings.get("house-1:user-1")!.morning_summary_time = "20:30";
    await service.run({}, new Date("2026-09-02T11:30:00.000Z"));
    expect(attempts).toBe(2);
    await service.run({}, new Date("2026-09-03T11:30:00.000Z"));
    expect(attempts).toBe(3);
    expect(
      Array.from(db.notificationDeliveries.values()).map((row) => row.target_key)
    ).toEqual(["2026-09-02:09:00", "2026-09-02:20:30", "2026-09-03:20:30"]);
  });

  it("deduplicates one evening slot, permits a changed time, and sends on the next date", async () => {
    const db = schedulerDb(null);
    db.notificationSettings.set("house-1:user-1", {
      user_id: "user-1",
      household_id: "house-1",
      morning_summary_enabled: 0,
      morning_summary_time: "09:00",
      evening_summary_enabled: 1,
      evening_summary_time: "21:00",
      timezone: "Asia/Tokyo",
      updated_at: "2026-01-01"
    });
    let attempts = 0;
    const service = new NotificationSchedulerService(db as unknown as D1Database, {
      sendPayload: () => {
        attempts += 1;
        return Promise.resolve({ sent: 1, failed: 0 });
      }
    });

    await service.run({}, new Date("2026-09-02T12:00:00.000Z"));
    await service.run({}, new Date("2026-09-02T12:05:00.000Z"));
    expect(attempts).toBe(1);
    db.notificationSettings.get("house-1:user-1")!.evening_summary_time = "20:30";
    await service.run({}, new Date("2026-09-02T11:30:00.000Z"));
    expect(attempts).toBe(2);
    await service.run({}, new Date("2026-09-03T11:30:00.000Z"));
    expect(attempts).toBe(3);
    expect(
      Array.from(db.notificationDeliveries.values()).map((row) => row.target_key)
    ).toEqual(["2026-09-02:21:00", "2026-09-02:20:30", "2026-09-03:20:30"]);
  });

  it("delivers morning and evening summaries independently in the configured timezone", async () => {
    const db = schedulerDb(null);
    db.notificationSettings.set("house-1:user-1", {
      user_id: "user-1",
      household_id: "house-1",
      evening_summary_enabled: 0,
      evening_summary_time: "21:00",
      morning_summary_enabled: 1,
      morning_summary_time: "09:00",
      timezone: "Asia/Tokyo",
      updated_at: "2026-01-01"
    });
    const sentTypes: string[] = [];
    const service = new NotificationSchedulerService(db as unknown as D1Database, {
      sendPayload: (_userId, _householdId, payload) => {
        sentTypes.push((payload as { title: string }).title);
        return Promise.resolve({ sent: 1, failed: 0 });
      }
    });
    await service.run({}, new Date("2026-08-13T00:00:00.000Z"));
    expect(sentTypes).toEqual(["朝の家事が1件残っています"]);
    await service.run({}, new Date("2026-08-13T12:00:00.000Z"));
    expect(sentTypes).toEqual(["朝の家事が1件残っています"]);
    db.notificationSettings.get("house-1:user-1")!.evening_summary_enabled = 1;
    await service.run({}, new Date("2026-08-13T12:05:00.000Z"));
    expect(sentTypes).toEqual([
      "朝の家事が1件残っています",
      "今日の家事が1件残っています"
    ]);
  });

  it("does not send an evening summary when all tasks are complete", async () => {
    const db = schedulerDb(null);
    db.notificationSettings.set("house-1:user-1", {
      user_id: "user-1",
      household_id: "house-1",
      evening_summary_enabled: 1,
      evening_summary_time: "21:00",
      timezone: "Asia/Tokyo",
      updated_at: "2026-01-01"
    });
    db.taskRecords.set("record-1", {
      id: "record-1",
      household_id: "house-1",
      task_id: "task-1",
      target_date: "2026-08-13",
      target_week_start: null,
      status: "completed",
      acted_by: "user-1",
      started_at: null,
      completed_at: "2026-08-13T11:00:00.000Z",
      skipped_at: null,
      note: null,
      created_at: "2026-08-13T11:00:00.000Z",
      updated_at: "2026-08-13T11:00:00.000Z"
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

    expect(Array.from(db.notificationDeliveries.values())[0]?.target_key).toBe(
      "task-1:2026-08-13:23:55"
    );
  });
});
