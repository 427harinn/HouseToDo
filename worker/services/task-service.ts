import { getLocalDate, getLocalTime, getWeekEndDate, getWeekStartDate } from "../lib/date-time";
import { projectTaskOnDate } from "../lib/task-model";
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
import { validateTaskWriteInput, type TaskPatchInput, type TaskStateInput, type TaskWriteInput } from "../lib/validation";
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
  scopeKind?: "occurrence" | "period";
  occurrenceKey?: string | null;
  periodKey?: string | null;
  periodStart?: string;
  periodEnd?: string;
  deadlineDate?: string | null;
  deadlineTime?: string | null;
  completedCount?: number;
  overdue?: boolean;
};

export type HomeHistoryRecord = {
  record: TaskRecord;
  task: Task | null;
  taskActive: boolean;
};

export type WeeklyTaskSummary = Task & {
  targetCount: number;
  completedCount: number;
  remainingCount: number;
  status: TaskDisplayStatus;
  latestAction: TaskRecord | null;
};

export type CalendarDateMarker = {
  fixedCount: number;
  fixedCompletedCount: number;
  fixedSkippedCount: number;
};

export type CalendarData = {
  from: string;
  to: string;
  today: string;
  timezone: string;
  selectedDate: string;
  dates: Record<string, CalendarDateMarker>;
  selected: {
    fixed: TaskWithStatus[];
    weeklyFlexible: TaskWithStatus[];
    monthlyFlexible: TaskWithStatus[];
  };
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

  async listRecentTasks(userId: string, limit = 8): Promise<Task[]> {
    const household = await this.households.requireCurrentHousehold(userId);
    return this.tasks.listRecentCanonicalByHouseholdId(household.id, Math.min(Math.max(limit, 1), 10));
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
        // Legacy requests historically became active immediately. Canonical requests
        // receive the household-local creation date when startDate is omitted.
        startDate: input.startDate ?? (input.modelRecurrenceType ? getLocalDate(new Date(), household.timezone) : null),
        sortOrder: Date.now(),
        createdBy: userId,
        now
      },
      input.weekdays
    );
  }

  async updateTask(userId: string, taskId: string, input: TaskPatchInput): Promise<Task> {
    const household = await this.households.requireCurrentHousehold(userId);
    const current = await this.requireTask(household.id, taskId);
    const requestedRecurrence = input.modelRecurrenceType ?? input.recurrenceType;
    const recurrenceChanged = requestedRecurrence !== undefined && requestedRecurrence !== (current.modelRecurrenceType ?? current.recurrenceType);
    const mergedCandidate = {
      title: current.title,
      description: current.description,
      modelRecurrenceType: input.modelRecurrenceType ?? (input.recurrenceType ? null : current.modelRecurrenceType),
      assignmentType: current.assignmentType,
      assignedUserId: current.assignedUserId,
      scheduledTime: current.scheduledTime,
      notificationSlot: current.notificationSlot,
      notificationTime: current.notificationTime,
      weekdays: current.weekdays,
      weeklyTargetCount: current.weeklyTargetCount,
      startDate: current.startDate,
      targetDate: current.targetDate,
      deadlineTime: current.deadlineTime,
      notificationOffsetMinutes: current.notificationOffsetMinutes,
      weeklyDeadlineWeekday: current.weeklyDeadlineWeekday,
      monthlyDayOfMonth: current.monthlyDayOfMonth,
      monthlyDeadlineType: current.monthlyDeadlineType,
      ...input,
      recurrenceType: input.modelRecurrenceType ?? input.recurrenceType ?? current.modelRecurrenceType ?? current.recurrenceType
    } as Record<string, unknown>;
    if (recurrenceChanged) {
      const type = requestedRecurrence as string;
      mergedCandidate.weekdays = ["weekly_fixed", "scheduled"].includes(type) ? input.weekdays ?? [] : [];
      mergedCandidate.weeklyTargetCount = type === "weekly" ? input.weeklyTargetCount ?? null : null;
      mergedCandidate.weeklyDeadlineWeekday = type === "weekly_flexible" ? input.weeklyDeadlineWeekday ?? null : null;
      mergedCandidate.monthlyDayOfMonth = ["monthly_fixed", "monthly_flexible"].includes(type) ? input.monthlyDayOfMonth ?? input.monthlyDeadlineDay ?? null : null;
      mergedCandidate.monthlyDeadlineType = type === "monthly_flexible" ? input.monthlyDeadlineType ?? null : null;
    }
    const merged = validateTaskWriteInput(mergedCandidate);
    await this.validateAssignee(household.id, merged);
    const updated = await this.tasks.update(household.id, taskId, { ...merged, now: nowIso() });
    if (!updated) throw taskNotFoundError();
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
    const allTasks = await this.tasks.listByHouseholdId(household.id);
    const projections = allTasks.map((task) => ({ task, scope: projectTaskOnDate(task, targetDate) })).filter(({ task, scope }) =>
      task.modelRecurrenceType ? scope.matchesDate : (task.recurrenceType === "daily" || task.recurrenceType === "scheduled") && scope.matchesDate
    );
    const records = byTaskId(await this.records.listDailyRecords(household.id, targetDate));
    const periodKeys = projections.map(({ scope }) => scope.periodKey).filter((key): key is string => Boolean(key));
    const periodRecords = byTaskId(await this.records.listByPeriodKeys(household.id, periodKeys));
    return {
      date: targetDate,
      tasks: projections
        .map(({ task, scope }) => this.mergeProjectedStatus(task, scope, scope.periodKey ? periodRecords.get(task.id)?.filter((record) => record.periodKey === scope.periodKey) ?? [] : records.get(task.id) ?? [], household.timezone))
        .sort(compareTodayTasks)
    };
  }

  async listHome(userId: string, date?: string | null): Promise<{
    date: string;
    tasks: TaskWithStatus[];
    completed: HomeHistoryRecord[];
    passed: HomeHistoryRecord[];
  }> {
    const household = await this.households.requireCurrentHousehold(userId);
    const targetDate = date ?? getLocalDate(new Date(), household.timezone);
    const allTasks = await this.tasks.listByHouseholdId(household.id, { includeInactive: true });
    const activeTasks = allTasks.filter((task) => task.active);
    const allRecords = await this.records.listByHouseholdId(household.id);
    const recordsByTask = byTaskId(allRecords);
    const weekStart = getWeekStartDate(targetDate, household.weekStartsOn);
    const projected: TaskWithStatus[] = [];

    for (const task of activeTasks) {
      if (task.modelRecurrenceType) {
        const scope = projectTaskOnDate(task, targetDate);
        if (!scope.matchesDate) continue;
        const scopedRecords = scope.scopeType === "period"
          ? (recordsByTask.get(task.id) ?? []).filter((record) => record.periodKey === scope.periodKey)
          : (recordsByTask.get(task.id) ?? []).filter((record) =>
              record.occurrenceKey === scope.occurrenceKey ||
              (!record.occurrenceKey && record.targetDate === scope.targetDate)
            );
        const current = this.mergeProjectedStatus(task, scope, scopedRecords, household.timezone);
        if (current.status === "pending" || current.status === "in_progress") projected.push(current);
        continue;
      }

      if (task.recurrenceType === "daily" || task.recurrenceType === "scheduled") {
        const scope = projectTaskOnDate(task, targetDate);
        if (!scope.matchesDate) continue;
        const current = this.mergeProjectedStatus(
          task,
          scope,
          (recordsByTask.get(task.id) ?? []).filter((record) => record.targetDate === targetDate),
          household.timezone
        );
        if (current.status === "pending" || current.status === "in_progress") projected.push(current);
        continue;
      }

      // Legacy weekly tasks have no canonical deadline projection, but must stay
      // visible as pending household work until their existing weekly target is met.
      if (task.recurrenceType === "weekly") {
        const weekly = this.mergeWeeklyStatus(
          task,
          (recordsByTask.get(task.id) ?? []).filter((record) => record.targetWeekStart === weekStart)
        );
        if (weekly.status === "pending" || weekly.status === "in_progress") {
          const weeklyBase = this.mergeDailyStatus(task, weekly.latestAction);
          projected.push({
            ...weeklyBase,
            status: weekly.status,
            completedCount: weekly.completedCount,
            scopeKind: "period",
            periodStart: weekStart,
            periodEnd: getWeekEndDate(weekStart, household.weekStartsOn),
            deadlineDate: null,
            deadlineTime: null,
            overdue: false
          });
        }
      }
    }

    const history = allRecords
      .filter((record) => record.status === "completed" || record.status === "skipped")
      .filter((record) => getLocalDate(record.completedAt ?? record.skippedAt ?? record.updatedAt, household.timezone) === targetDate)
      .map((record) => ({ record, task: allTasks.find((task) => task.id === record.taskId) ?? null, taskActive: Boolean(allTasks.find((task) => task.id === record.taskId)?.active) }));

    return {
      date: targetDate,
      tasks: projected.sort(compareTodayTasks),
      completed: history.filter(({ record }) => record.status === "completed"),
      passed: history.filter(({ record }) => record.status === "skipped")
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
    const allTasks = (await this.tasks.listByHouseholdId(household.id)).filter((task) => task.recurrenceType === "weekly");
    const legacyTasks = allTasks.filter((task) => !task.modelRecurrenceType);
    const canonicalTasks = allTasks.filter((task) => task.modelRecurrenceType === "weekly_flexible");
    const canonicalSummaries = await Promise.all(canonicalTasks.map(async (task) => {
      const scope = projectTaskOnDate(task, targetWeekStart).matchesDate
        ? projectTaskOnDate(task, targetWeekStart)
        : projectTaskOnDate(task, getWeekEndDate(targetWeekStart, household.weekStartsOn));
      if (!scope.matchesDate || !scope.periodKey) return null;
      const scopedRecords = await this.records.listByPeriodKey(task.id, scope.periodKey);
      const projected = this.mergeProjectedStatus(task, scope, scopedRecords, household.timezone);
      return { ...task, targetCount: 1, completedCount: projected.completedCount ?? 0, remainingCount: Math.max(1 - (projected.completedCount ?? 0), 0), status: projected.status, latestAction: scopedRecords[0] ?? null } as WeeklyTaskSummary;
    }));
    return {
      weekStart: targetWeekStart,
      weekEnd: getWeekEndDate(targetWeekStart, household.weekStartsOn),
      tasks: [...legacyTasks.map((task) => this.mergeWeeklyStatus(task, records.get(task.id) ?? [])), ...canonicalSummaries.filter((task): task is WeeklyTaskSummary => task !== null)]
    };
  }

  async listCalendar(userId: string, from: string, to: string, selectedDate?: string | null): Promise<CalendarData> {
    const household = await this.households.requireCurrentHousehold(userId);
    const dateKeys: string[] = [];
    for (let date = from; date <= to; date = nextDateKey(date)) dateKeys.push(date);
    const targetDate = selectedDate ?? getLocalDate(new Date(), household.timezone);
    const allTasks = await this.tasks.listByHouseholdId(household.id);
    const isFlexible = (task: Task) => task.modelRecurrenceType === "weekly_flexible" || task.modelRecurrenceType === "monthly_flexible";
    const isFixed = (task: Task) => task.modelRecurrenceType
      ? !isFlexible(task)
      : task.recurrenceType === "daily" || task.recurrenceType === "scheduled";
    const periodKeys = allTasks
      .filter(isFlexible)
      .map((task) => projectTaskOnDate(task, targetDate))
      .filter((scope) => scope.matchesDate && scope.periodKey)
      .map((scope) => scope.periodKey as string);
    const records = await this.records.listCalendarRecords(household.id, from, to, Array.from(new Set(periodKeys)));
    const recordsByTaskId = byTaskId(records);
    const recordsForScope = (task: Task, scope: ReturnType<typeof projectTaskOnDate>) => {
      const taskRecords = recordsByTaskId.get(task.id) ?? [];
      return taskRecords.filter((record) => scope.occurrenceKey
        ? record.occurrenceKey === scope.occurrenceKey || (!record.occurrenceKey && record.targetDate === scope.targetDate)
        : scope.periodKey
          ? record.periodKey === scope.periodKey
          : false);
    };
    const dates: Record<string, CalendarDateMarker> = {};
    for (const date of dateKeys) {
      const projected = allTasks
        .filter(isFixed)
        .map((task) => ({ task, scope: projectTaskOnDate(task, date) }))
        .filter(({ scope }) => scope.matchesDate)
        .map(({ task, scope }) => this.mergeProjectedStatus(task, scope, recordsForScope(task, scope), household.timezone));
      dates[date] = {
        fixedCount: projected.length,
        fixedCompletedCount: projected.filter((task) => task.status === "completed").length,
        fixedSkippedCount: projected.filter((task) => task.status === "skipped").length
      };
    }
    const selectedFixed = allTasks
      .filter(isFixed)
      .map((task) => ({ task, scope: projectTaskOnDate(task, targetDate) }))
      .filter(({ scope }) => scope.matchesDate)
      .map(({ task, scope }) => this.mergeProjectedStatus(task, scope, recordsForScope(task, scope), household.timezone))
      .sort(compareTodayTasks);
    const selectedFlexible = allTasks
      .filter(isFlexible)
      .map((task) => ({ task, scope: projectTaskOnDate(task, targetDate) }))
      .filter(({ scope }) => scope.matchesDate)
      .map(({ task, scope }) => this.mergeProjectedStatus(task, scope, recordsForScope(task, scope), household.timezone))
      .sort(compareTodayTasks);
    return {
      from,
      to,
      today: getLocalDate(new Date(), household.timezone),
      timezone: household.timezone,
      selectedDate: targetDate,
      dates,
      selected: {
        fixed: selectedFixed,
        weeklyFlexible: selectedFlexible.filter((task) => task.modelRecurrenceType === "weekly_flexible"),
        monthlyFlexible: selectedFlexible.filter((task) => task.modelRecurrenceType === "monthly_flexible")
      }
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
    if (task.modelRecurrenceType) return this.changeCanonicalState(household, userId, task, action, input);
    return task.recurrenceType === "weekly"
      ? this.changeWeeklyState(household, userId, task, action, input)
      : this.changeDailyState(household, userId, task, action, input);
  }

  async listHistory(userId: string, taskId: string, limit: number): Promise<TaskRecord[]> {
    const household = await this.households.requireCurrentHousehold(userId);
    await this.requireTask(household.id, taskId);
    return this.records.listHistory(household.id, taskId, limit);
  }

  async restoreRecord(userId: string, taskId: string, recordId: string): Promise<{ reset: true }> {
    const household = await this.households.requireCurrentHousehold(userId);
    const task = await this.requireTask(household.id, taskId);
    const record = await this.records.findById(household.id, recordId);
    if (!record || record.taskId !== task.id) throw taskNotFoundError();
    const actionDate = getLocalDate(record.completedAt ?? record.skippedAt ?? record.updatedAt, household.timezone);
    const today = getLocalDate(new Date(), household.timezone);
    if (actionDate !== today) throw validationError({ recordId: "Only today's task record can be restored." });
    const removed = await this.records.deleteById(household.id, taskId, recordId);
    if (!removed) throw taskNotFoundError();
    if (!task.active) {
      const reactivated = await this.tasks.reactivate(household.id, taskId, nowIso());
      if (!reactivated) throw taskNotFoundError();
    }
    return { reset: true };
  }

  private async changeDailyState(
    household: HouseholdWithRole,
    userId: string,
    task: Task,
    action: "start" | "complete" | "skip" | "reset",
    input: TaskStateInput
  ): Promise<TaskWithStatus | { reset: true }> {
    const targetDate = input.targetDate ?? getLocalDate(new Date(), household.timezone);
    const scope = projectTaskOnDate(task, targetDate);
    if (!scope.matchesDate) {
      throw validationError({ targetDate: "Task is not scheduled for targetDate." });
    }
    const existing = await this.records.findDailyRecord(task.id, targetDate);
    if (action === "reset") {
      await this.records.deleteByScope(household.id, task.id, { targetDate, occurrenceKey: scope.occurrenceKey ?? undefined });
      return { reset: true };
    }
    const record = await this.applyState(userId, household.id, task, targetDate, null, action, existing, input.note);
    return this.mergeDailyStatus(task, record);
  }

  private async changeCanonicalState(household: HouseholdWithRole, userId: string, task: Task, action: "start" | "complete" | "skip" | "reset", input: TaskStateInput): Promise<TaskWithStatus | { reset: true }> {
    const targetDate = input.targetDate ?? getLocalDate(new Date(), household.timezone);
    const scope = projectTaskOnDate(task, targetDate);
    if (!scope.matchesDate) throw validationError({ targetDate: "Task is not scheduled for targetDate." });
    const existingRecords = scope.scopeType === "occurrence"
      ? (await this.records.findDailyRecord(task.id, targetDate))
        ? [await this.records.findDailyRecord(task.id, targetDate) as TaskRecord]
        : []
      : await this.records.listByPeriodKey(task.id, scope.periodKey!);
    if (action === "reset") {
      await this.records.deleteByScope(household.id, task.id, scope.scopeType === "occurrence" ? { occurrenceKey: scope.occurrenceKey! } : { periodKey: scope.periodKey! });
      return { reset: true };
    }
    const completed = existingRecords.filter((record) => record.status === "completed");
    const skipped = existingRecords.find((record) => record.status === "skipped");
    if (action === "skip" && completed.length > 0) throw taskConflictError("TASK_ALREADY_COMPLETED", "Completed period cannot be skipped.");
    if (skipped && action !== "start") return this.mergeProjectedStatus(task, scope, existingRecords, household.timezone);
    const open = existingRecords.find((record) => record.status === "in_progress") ?? null;
    if (action === "complete" && open === null && scope.scopeType === "occurrence" && completed.length > 0) return this.mergeProjectedStatus(task, scope, existingRecords, household.timezone);
    const record = await this.applyState(
      userId,
      household.id,
      task,
      scope.scopeType === "occurrence" ? targetDate : null,
      null,
      action,
      open,
      input.note,
      scope.occurrenceKey,
      scope.periodKey
    );
    return this.mergeProjectedStatus(task, scope, [record, ...existingRecords.filter((item) => item.id !== record.id)], household.timezone);
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
      task,
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
    task: Task,
    targetDate: string | null,
    targetWeekStart: string | null,
    action: "start" | "complete" | "skip",
    existing: TaskRecord | null,
    note?: string | null,
    occurrenceKey?: string | null,
    periodKey?: string | null
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
    const assignee = task.assignedUserId
      ? await this.members.findProfile(householdId, task.assignedUserId)
      : null;
    const recordInput: RecordStateInput = {
      id: existing?.id ?? crypto.randomUUID(),
      householdId,
      taskId: task.id,
      targetDate,
      targetWeekStart,
      occurrenceKey,
      periodKey,
      status,
      actedBy: userId,
      startedAt: action === "start" ? now : existing?.startedAt ?? null,
      completedAt: action === "complete" ? now : null,
      skippedAt: action === "skip" ? now : null,
      note: action === "skip" ? note ?? null : null,
      taskTitleSnapshot: task.title,
      assignedUserIdSnapshot: task.assignedUserId,
      assignedUserDisplayNameSnapshot: assignee?.displayName ?? null,
      assignedUserColorSnapshot: assignee?.color ?? null,
      assignedUserAvatarUrlSnapshot: assignee?.avatar
        ? `/api/users/${encodeURIComponent(assignee.userId)}/avatar?v=${encodeURIComponent(assignee.avatarUpdatedAt ?? "")}`
        : null,
      now
    };
    // Flexible canonical tasks are period-scoped even though the action carries
    // a concrete target date. Keep periodKey as the identity and leave
    // targetDate null so the legacy daily-scope unique index cannot collapse
    // or reject multiple executions in the same period.
    if (periodKey) {
      if (existing) return (await this.records.updateById(householdId, existing.id, recordInput))!;
      return this.records.createWeeklyRecord(recordInput);
    }
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

  private mergeProjectedStatus(task: Task, scope: ReturnType<typeof projectTaskOnDate>, records: TaskRecord[], timezone: string): TaskWithStatus {
    const completedCount = records.filter((record) => record.status === "completed").length;
    const completed = completedCount > 0;
    const skipped = records.find((record) => record.status === "skipped") ?? null;
    const inProgress = records.find((record) => record.status === "in_progress") ?? null;
    const record = completed ? (records.find((item) => item.status === "completed") ?? null) : inProgress ?? skipped;
    const status: TaskDisplayStatus = skipped ? "skipped" : completed ? "completed" : inProgress ? "in_progress" : "pending";
    const today = getLocalDate(new Date(), timezone);
    const time = getLocalTime(new Date(), timezone);
    const overdue = status === "pending" && Boolean(scope.deadlineTime) && (scope.deadlineDate < today || (scope.deadlineDate === today && scope.deadlineTime! < time));
    return { ...this.mergeDailyStatus(task, record), status, scopeKind: scope.scopeType, occurrenceKey: scope.occurrenceKey, periodKey: scope.periodKey, periodStart: scope.periodStart, periodEnd: scope.periodEnd, deadlineDate: scope.deadlineDate, deadlineTime: scope.deadlineTime, completedCount, overdue };
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
  if (Boolean(a.overdue) !== Boolean(b.overdue)) return a.overdue ? -1 : 1;
  const aDate = a.deadlineDate ?? null;
  const bDate = b.deadlineDate ?? null;
  if (aDate && bDate && aDate !== bDate) return aDate.localeCompare(bDate);
  if (aDate && !bDate) return -1;
  if (!aDate && bDate) return 1;
  const aTime = a.deadlineTime ?? a.scheduledTime ?? null;
  const bTime = b.deadlineTime ?? b.scheduledTime ?? null;
  if (aTime && bTime && aTime !== bTime) return aTime.localeCompare(bTime);
  if (aTime && !bTime) return -1;
  if (!aTime && bTime) return 1;
  return a.sortOrder - b.sortOrder;
};

const nextDateKey = (dateKey: string): string => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
};
