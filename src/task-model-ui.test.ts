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
      targetDate: "実施日を選択してください。"
    });
    expect(validateTaskFormState({ ...defaultTaskForm(), title: "曜日", recurrence: "weekly_fixed" })).toHaveProperty("weekdays");
    expect(validateTaskFormState({ ...defaultTaskForm(), title: "月", recurrence: "monthly_fixed", monthlyDayOfMonth: 32 })).toHaveProperty("monthlyDayOfMonth");
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
    expect(validateTaskFormState(form)).toHaveProperty("targetDate");
    expect(validateTaskFormState(form, { template: true })).not.toHaveProperty("targetDate");
    expect(taskFormToTemplatePayload(form)).toMatchObject({ modelRecurrenceType: "once" });
  });
});
