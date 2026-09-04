import { describe, expect, it } from "vitest";
import type { Task } from "./api/tasks";
import {
  changeTaskFormRecurrence,
  defaultTaskForm,
  taskFormToPayload,
  taskFormToTemplatePayload,
  taskTemplateToFormState,
  taskToFormState,
  taskToTemplatePayload,
  validateTaskFormState
} from "./task-model-ui";

describe("task model form mapping", () => {
  it("defaults new task forms to a one-time recurrence", () => {
    expect(defaultTaskForm()).toMatchObject({ recurrence: "once", executionTiming: "on_date", startDate: "", targetDate: "" });
    expect(taskFormToPayload({
      ...defaultTaskForm(), title: "今日の家事", startDate: "2026-09-01", targetDate: "2026-09-01"
    })).toMatchObject({
      recurrenceType: "once", modelRecurrenceType: "once", startDate: "2026-09-01", targetDate: "2026-09-01"
    });
  });

  it("maps deadline timing to a period-scoped once task", () => {
    const form = {
      ...defaultTaskForm(),
      title: "エアコン掃除",
      executionTiming: "by_deadline" as const,
      startDate: "2026-09-10",
      deadlineDate: "2026-09-20"
    };
    expect(validateTaskFormState(form)).toEqual({});
    expect(taskFormToPayload(form)).toMatchObject({
      recurrenceType: "once",
      modelRecurrenceType: "once",
      executionTiming: "by_deadline",
      startDate: "2026-09-10",
      targetDate: null,
      deadlineDate: "2026-09-20"
    });
    expect(validateTaskFormState({ ...form, deadlineDate: "" })).toHaveProperty("deadlineDate");
    expect(validateTaskFormState({ ...form, deadlineDate: "2026-09-01" })).toHaveProperty("deadlineDate");
  });

  it("cleans recurrence-specific state when the type changes", () => {
    const weekly = {
      ...defaultTaskForm(), recurrence: "weekly_fixed" as const, weekdays: [2, 5],
      monthlyDayOfMonth: 31, weeklyDeadlineWeekday: 4
    };
    expect(changeTaskFormRecurrence(weekly, "daily")).toMatchObject({
      recurrence: "daily", weekdays: [], monthlyDayOfMonth: null, weeklyDeadlineWeekday: 0,
      monthlyDeadlineType: "month_end"
    });
    expect(changeTaskFormRecurrence(weekly, "weekly_flexible")).toMatchObject({
      recurrence: "weekly_flexible", weekdays: [], monthlyDayOfMonth: null, weeklyDeadlineWeekday: 4
    });
  });

  it("maps all canonical schedule fields and preserves month_end semantics", () => {
    const payload = taskFormToPayload({
      ...defaultTaskForm(), title: "月の掃除", recurrence: "monthly_flexible",
      deadlineTime: "21:00", notificationOffsetMinutes: 60, monthlyDeadlineType: "month_end",
      monthlyDayOfMonth: 31
    });
    expect(payload).toMatchObject({
      modelRecurrenceType: "monthly_flexible", recurrenceType: "monthly_flexible",
      deadlineTime: "21:00", notificationOffsetMinutes: 60,
      monthlyDeadlineType: "month_end", monthlyDayOfMonth: null
    });
  });

  it("clears the notification preset when the deadline is absent", () => {
    const payload = taskFormToPayload({
      ...defaultTaskForm(), title: "毎日", deadlineTime: "", notificationOffsetMinutes: 30
    });
    expect(payload.notificationOffsetMinutes).toBeNull();
  });

  it("validates recurrence-specific fields near the form", () => {
    expect(validateTaskFormState({ ...defaultTaskForm(), recurrence: "once" })).toMatchObject({
      title: "タスク名を入力してください。",
      startDate: "開始日を選択してください。"
    });
    expect(validateTaskFormState({ ...defaultTaskForm(), title: "曜日", recurrence: "weekly_fixed" })).toHaveProperty("weekdays");
    expect(validateTaskFormState({ ...defaultTaskForm(), title: "月", recurrence: "monthly_fixed", monthlyDayOfMonth: 32 })).toHaveProperty("monthlyDayOfMonth");
  });

  it("canonicalizes once dates from either the new start date or a legacy target date", () => {
    const legacy = {
      id: "once-legacy", title: "一度だけ", description: null, recurrenceType: "model_only", modelRecurrenceType: "once",
      assignmentType: "anyone", assignedUserId: null, assignment: { type: "anyone", user: null }, scheduledTime: null,
      notificationSlot: "none", notificationTime: null, weekdays: [], weeklyTargetCount: null, startDate: null,
      targetDate: "2026-08-17", deadlineTime: null, notificationOffsetMinutes: null, active: true, sortOrder: 1,
      createdBy: "user", createdAt: "2026-08-01", updatedAt: "2026-08-01"
    } satisfies Task;
    const form = taskToFormState(legacy);
    expect(form).toMatchObject({ recurrence: "once", startDate: "2026-08-17", targetDate: "2026-08-17" });
    expect(taskFormToPayload({ ...form, startDate: "2026-08-20", targetDate: "2026-08-17" })).toMatchObject({ startDate: "2026-08-20", targetDate: "2026-08-20" });
  });

  it("keeps recurring startDate and never sends a recurring targetDate", () => {
    const form = { ...defaultTaskForm(), title: "毎日", recurrence: "daily" as const, startDate: "2026-08-20", targetDate: "2026-08-21" };
    expect(taskFormToPayload(form)).toMatchObject({ startDate: "2026-08-20", targetDate: null });
  });

  it("clears notification state for all-day tasks and preserves time notification relation", () => {
    expect(taskFormToPayload({ ...defaultTaskForm(), title: "終日", deadlineTime: "", notificationOffsetMinutes: 30 })).toMatchObject({ deadlineTime: null, notificationOffsetMinutes: null });
    expect(taskFormToPayload({ ...defaultTaskForm(), title: "時刻あり", deadlineTime: "09:30", notificationOffsetMinutes: 10 })).toMatchObject({ deadlineTime: "09:30", notificationOffsetMinutes: 10 });
  });

  it("keeps legacy weekly target counts in the compatibility form", () => {
    const legacy = taskToFormState({
      id: "legacy", title: "週3回", description: null, recurrenceType: "weekly", modelRecurrenceType: null,
      assignmentType: "anyone", assignedUserId: null, assignment: { type: "anyone", user: null },
      scheduledTime: null, notificationSlot: "none", notificationTime: "20:00", weekdays: [], weeklyTargetCount: 3,
      active: true, sortOrder: 1, createdBy: "user", createdAt: "2026-01-01", updatedAt: "2026-01-01"
    } satisfies Task);
    expect(legacy).toMatchObject({ recurrence: "legacy_weekly", weeklyTargetCount: 3, legacyNotificationTime: "20:00" });
    expect(taskFormToPayload(legacy)).toMatchObject({ recurrenceType: "weekly", weeklyTargetCount: 3, notificationTime: "20:00" });
  });

  it("restores flexible compatibility as separate recurrence and timing labels", () => {
    const form = taskToFormState({
      id: "flexible", title: "週の家事", description: null, recurrenceType: "weekly", modelRecurrenceType: "weekly_flexible",
      assignmentType: "anyone", assignedUserId: null, assignment: { type: "anyone", user: null }, scheduledTime: null,
      notificationSlot: "none", notificationTime: null, weekdays: [], weeklyTargetCount: null,
      startDate: "2026-09-01", targetDate: null, deadlineDate: null, deadlineTime: null, notificationOffsetMinutes: null,
      weeklyDeadlineWeekday: 0, monthlyDayOfMonth: null, monthlyDeadlineType: null, active: true, sortOrder: 1,
      createdBy: "user", createdAt: "2026-09-01", updatedAt: "2026-09-01"
    } satisfies Task);
    expect(form).toMatchObject({ recurrence: "weekly_flexible", executionTiming: "this_week" });
    expect(taskFormToPayload(form)).toMatchObject({ modelRecurrenceType: "weekly_flexible", executionTiming: "this_week" });
  });

  it("prefills reusable definitions without copying dates or task identity", () => {
    const task = {
      id: "old-task", title: "ゴミ出し", description: "朝", recurrenceType: "weekly_fixed", modelRecurrenceType: "weekly_fixed",
      assignmentType: "anyone", assignedUserId: null, assignment: { type: "anyone", user: null }, scheduledTime: null,
      notificationSlot: "none", notificationTime: null, weekdays: [2, 5], weeklyTargetCount: null, startDate: "2026-07-01",
      targetDate: null, deadlineTime: "21:00", notificationOffsetMinutes: 30, weeklyDeadlineWeekday: null,
      monthlyDayOfMonth: null, monthlyDeadlineType: null, active: true, sortOrder: 1, createdBy: "user",
      createdAt: "2026-07-01", updatedAt: "2026-07-02"
    } satisfies Task;
    const form = taskToFormState(task);
    expect(form).toMatchObject({ title: "ゴミ出し", startDate: "2026-07-01", deadlineTime: "21:00" });
    const templatePayload = taskToTemplatePayload(task);
    expect(templatePayload).toMatchObject({ title: "ゴミ出し", modelRecurrenceType: "weekly_fixed", weekdays: [2, 5], deadlineTime: "21:00", notificationOffsetMinutes: 30 });
    expect(templatePayload).not.toHaveProperty("startDate");
    expect(templatePayload).not.toHaveProperty("targetDate");
  });

  it("requires a new date when once definitions are reused", () => {
    const form = taskTemplateToFormState({
      id: "template", title: "一度だけ", description: null, modelRecurrenceType: "once", assignmentType: "anyone",
      assignedUserId: null, weekdays: [], deadlineTime: null, notificationOffsetMinutes: null,
      weeklyDeadlineWeekday: null, monthlyDayOfMonth: null, monthlyDeadlineType: null,
      active: true, sortOrder: 1, createdBy: "user", createdAt: "2026-01-01", updatedAt: "2026-01-01"
    });
    expect(form).toMatchObject({ targetDate: "", startDate: "", recurrence: "once" });
    expect(validateTaskFormState(form)).toHaveProperty("startDate");
    expect(validateTaskFormState(form, { template: true })).not.toHaveProperty("startDate");
    expect(taskFormToTemplatePayload(form)).toMatchObject({ modelRecurrenceType: "once" });
  });
});
