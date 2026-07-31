import { getLocalDate, getWeekEndDate, getWeekStartDate, isTaskScheduledForDate } from "../lib/date-time";
import {
  AppError,
  inactiveTaskError,
  taskConflictError,
  taskNotFoundError,
  validationError
} from "../lib/errors";
import { nowIso } from "../lib/date";
import { HouseholdMemberRepository } from "../repositories/household-member-repository";
import { TaskRecordRepository, type RecordStateInput } from "../repositories/task-record-repository";
import { TaskRepository } from "../repositories/task-repository";
import type { TaskStateInput, TaskWriteInput } from "../lib/validation";
import type {
  HouseholdWithRole,
  Task,
  TaskDisplayStatus,
  TaskRecord,
  TaskRecordStatus
} from "../types/domain";
import { HouseholdService } from "./household-service";

export type TaskWithStatus = Task & {
  status: TaskDisplayStatus;
  actedBy: { userId: string; displayName: string | null } | null;
  startedAt: string | null;
  completedAt: string | null;
  skippedAt: string | null;
  note: string | null;
};

export type WeeklyTaskSummary = Task & {
  targetCount: number;
  completedCount: number;
  remainingCount: number;
  status: TaskDisplayStatus;
  latestAction: TaskRecord | null;
};

const byTaskId = <T extends { taskId: string }>(items: T[]): Map<string, T[]> => {
  const map = new Map<string, T[]>();
  for (const item of items) {
    map.set(item.taskId, [...(map.get(item.taskId) ?? []), item]);
  }
  return map;
};

export class TaskService {
  private readonly households: HouseholdService;
  private readonly members: HouseholdMemberRepository;
  private readonly tasks: TaskRepository;
  private readonly records: TaskRecordRepository;

  constructor(private readonly db: D1Database) {
    this.households = new HouseholdService(db);
    this.members = new HouseholdMemberRepository(db);
    this.tasks = new TaskRepository(db);
    this.records = new TaskRecordRepository(db);
  }

  async listTasks(userId: string, includeInactive = false): Promise<Task[]> {
    const household = await this.households.requireCurrentHousehold(userId);
    return this.tasks.listByHouseholdId(household.id, { includeInactive });
  }

  async getTask(userId: string, taskId: string): Promise<Task> {
    const household = await this.households.requireCurrentHousehold(userId);
    return this.requireTask(household.id, taskId);
  }

  async createTask(userId: string, input: TaskWriteInput): Promise<Task> {
    const household = await this.households.requireCurrentHousehold(userId);
    await this.validateAssignee(household.id, input);
    const now = nowIso();
    return this.tasks.create(
      {
        id: crypto.randomUUID(),
        householdId: household.id,
        ...input,
        sortOrder: Date.now(),
        createdBy: userId,
        now
      },
      input.weekdays
    );
  }

  async updateTask(userId: string, taskId: string, input: TaskWriteInput): Promise<Task> {
    const household = await this.households.requireCurrentHousehold(userId);
    await this.requireTask(household.id, taskId);
    await this.validateAssignee(household.id, input);
    const updated = await this.tasks.update(household.id, taskId, { ...input, now: nowIso() });
    if (!updated) throw taskNotFoundError();
    await this.tasks.replaceWeekdays(taskId, input.weekdays);
    return this.requireTask(household.id, taskId);
  }

  async deactivateTask(userId: string, taskId: string): Promise<void> {
    const household = await this.households.requireCurrentHousehold(userId);
    const ok = await this.tasks.deactivate(household.id, taskId, nowIso());
    if (!ok) throw taskNotFoundError();
  }

  async listToday(userId: string, date?: string | null): Promise<{ date: string; tasks: TaskWithStatus[] }> {
    const household = await this.households.requireCurrentHousehold(userId);
    const targetDate = date ?? getLocalDate(new Date(), household.timezone);
    const tasks = (await this.tasks.listByHouseholdId(household.id)).filter(
      (task) =>
        task.recurrenceType === "daily" ||
        (task.recurrenceType === "scheduled" && isTaskScheduledForDate(task.weekdays, targetDate))
    );
    const records = byTaskId(await this.records.listDailyRecords(household.id, targetDate));
    return {
      date: targetDate,
      tasks: tasks
        .map((task) => this.mergeDailyStatus(task, records.get(task.id)?.[0] ?? null))
        .sort(compareTodayTasks)
    };
  }

  async listWeek(
    userId: string,
    weekStart?: string | null
  ): Promise<{ weekStart: string; weekEnd: string; tasks: WeeklyTaskSummary[] }> {
    const household = await this.households.requireCurrentHousehold(userId);
    const targetWeekStart =
      weekStart ?? getWeekStartDate(getLocalDate(new Date(), household.timezone), household.weekStartsOn);
    const records = byTaskId(await this.records.listWeeklyRecords(household.id, targetWeekStart));
    const tasks = (await this.tasks.listByHouseholdId(household.id)).filter(
      (task) => task.recurrenceType === "weekly"
    );
    return {
      weekStart: targetWeekStart,
      weekEnd: getWeekEndDate(targetWeekStart, household.weekStartsOn),
      tasks: tasks.map((task) => this.mergeWeeklyStatus(task, records.get(task.id) ?? []))
    };
  }

  async changeState(
    userId: string,
    taskId: string,
    action: "start" | "complete" | "skip" | "reset",
    input: TaskStateInput
  ): Promise<TaskWithStatus | WeeklyTaskSummary | { reset: true }> {
    const household = await this.households.requireCurrentHousehold(userId);
    const task = await this.requireTask(household.id, taskId);
    if (!task.active) throw inactiveTaskError();
    return task.recurrenceType === "weekly"
      ? this.changeWeeklyState(household, userId, task, action, input)
      : this.changeDailyState(household, userId, task, action, input);
  }

  async listHistory(userId: string, taskId: string, limit: number): Promise<TaskRecord[]> {
    const household = await this.households.requireCurrentHousehold(userId);
    await this.requireTask(household.id, taskId);
    return this.records.listHistory(household.id, taskId, limit);
  }

  private async changeDailyState(
    household: HouseholdWithRole,
    userId: string,
    task: Task,
    action: "start" | "complete" | "skip" | "reset",
    input: TaskStateInput
  ): Promise<TaskWithStatus | { reset: true }> {
    const targetDate = input.targetDate ?? getLocalDate(new Date(), household.timezone);
    if (task.recurrenceType === "scheduled" && !isTaskScheduledForDate(task.weekdays, targetDate)) {
      throw validationError({ targetDate: "Task is not scheduled for targetDate." });
    }
    const existing = await this.records.findDailyRecord(task.id, targetDate);
    if (action === "reset") {
      await this.records.deleteByScope(household.id, task.id, { targetDate });
      return { reset: true };
    }
    const record = await this.applyState(userId, household.id, task.id, targetDate, null, action, existing, input.note);
    return this.mergeDailyStatus(task, record);
  }

  private async changeWeeklyState(
    household: HouseholdWithRole,
    userId: string,
    task: Task,
    action: "start" | "complete" | "skip" | "reset",
    input: TaskStateInput
  ): Promise<WeeklyTaskSummary | { reset: true }> {
    const targetWeekStart =
      input.targetWeekStart ??
      getWeekStartDate(getLocalDate(new Date(), household.timezone), household.weekStartsOn);
    const existingRecords = await this.records.listWeeklyRecords(household.id, targetWeekStart);
    if (action === "reset") {
      await this.records.deleteByScope(household.id, task.id, { targetWeekStart });
      return { reset: true };
    }
    const completed = existingRecords.filter((record) => record.status === "completed");
    const skipped = existingRecords.find((record) => record.status === "skipped");
    const open = existingRecords.find((record) => record.status === "in_progress") ?? skipped ?? null;
    if (action === "skip" && completed.length > 0) {
      throw taskConflictError("TASK_ALREADY_COMPLETED", "Completed weekly task cannot be skipped.");
    }
    if (skipped && action !== "start") return this.mergeWeeklyStatus(task, existingRecords);
    if (action === "complete" && completed.length >= (task.weeklyTargetCount ?? 1)) {
      return this.mergeWeeklyStatus(task, existingRecords);
    }
    const record = await this.applyState(
      userId,
      household.id,
      task.id,
      null,
      targetWeekStart,
      action,
      open,
      input.note
    );
    return this.mergeWeeklyStatus(task, [record, ...existingRecords.filter((item) => item.id !== record.id)]);
  }

  private async applyState(
    userId: string,
    householdId: string,
    taskId: string,
    targetDate: string | null,
    targetWeekStart: string | null,
    action: "start" | "complete" | "skip",
    existing: TaskRecord | null,
    note?: string | null
  ): Promise<TaskRecord> {
    const now = nowIso();
    if (existing?.status === "completed") return existing;
    if (existing?.status === "in_progress" && existing.actedBy !== userId && action === "start") {
      throw taskConflictError("TASK_IN_PROGRESS_BY_OTHER_MEMBER", "Task is already in progress.");
    }
    if (existing?.status === "in_progress" && existing.actedBy !== userId && action !== "start") {
      throw taskConflictError("TASK_IN_PROGRESS_BY_OTHER_MEMBER", "Task is in progress by another member.");
    }

    const status: TaskRecordStatus =
      action === "start" ? "in_progress" : action === "skip" ? "skipped" : "completed";
    const recordInput: RecordStateInput = {
      id: existing?.id ?? crypto.randomUUID(),
      householdId,
      taskId,
      targetDate,
      targetWeekStart,
      status,
      actedBy: userId,
      startedAt: action === "start" ? now : existing?.startedAt ?? null,
      completedAt: action === "complete" ? now : null,
      skippedAt: action === "skip" ? now : null,
      note: action === "skip" ? note ?? null : null,
      now
    };
    if (targetDate) return this.records.upsertDailyState(recordInput);
    if (existing) return (await this.records.updateById(householdId, existing.id, recordInput))!;
    return this.records.createWeeklyRecord(recordInput);
  }

  private mergeDailyStatus(task: Task, record: TaskRecord | null): TaskWithStatus {
    return {
      ...task,
      status: record?.status ?? "pending",
      actedBy: record ? { userId: record.actedBy, displayName: record.actedByDisplayName } : null,
      startedAt: record?.startedAt ?? null,
      completedAt: record?.completedAt ?? null,
      skippedAt: record?.skippedAt ?? null,
      note: record?.note ?? null
    };
  }

  private mergeWeeklyStatus(task: Task, records: TaskRecord[]): WeeklyTaskSummary {
    const targetCount = task.weeklyTargetCount ?? 1;
    const completedCount = records.filter((record) => record.status === "completed").length;
    const skipped = records.find((record) => record.status === "skipped") ?? null;
    const inProgress = records.find((record) => record.status === "in_progress") ?? null;
    const latestAction = records[0] ?? null;
    const status: TaskDisplayStatus = skipped
      ? "skipped"
      : completedCount >= targetCount
        ? "completed"
        : inProgress
          ? "in_progress"
          : "pending";
    return {
      ...task,
      targetCount,
      completedCount,
      remainingCount: Math.max(targetCount - completedCount, 0),
      status,
      latestAction
    };
  }

  private async requireTask(householdId: string, taskId: string): Promise<Task> {
    const task = await this.tasks.findByIdForHousehold(householdId, taskId);
    if (!task) throw taskNotFoundError();
    return task;
  }

  private async validateAssignee(householdId: string, input: TaskWriteInput): Promise<void> {
    if (input.assignmentType !== "specific" || !input.assignedUserId) return;
    const membership = await this.members.findMembership(householdId, input.assignedUserId);
    if (!membership) {
      throw new AppError({
        code: "ASSIGNEE_NOT_HOUSEHOLD_MEMBER",
        status: 400,
        message: "Assigned user must be a household member.",
        details: { assignedUserId: "Assigned user must be a household member." }
      });
    }
  }
}

const compareTodayTasks = (a: TaskWithStatus, b: TaskWithStatus): number => {
  if (a.scheduledTime && b.scheduledTime && a.scheduledTime !== b.scheduledTime) {
    return a.scheduledTime.localeCompare(b.scheduledTime);
  }
  if (a.scheduledTime && !b.scheduledTime) return -1;
  if (!a.scheduledTime && b.scheduledTime) return 1;
  return a.sortOrder - b.sortOrder;
};
