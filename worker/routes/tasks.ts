import { unauthenticatedError } from "../lib/errors";
import { okJson } from "../lib/response";
import {
  parseJsonBody,
  validateDateQuery,
  validateIncludeInactive,
  validateLimitQuery,
  validateTaskStateInput,
  validateTaskPatchInput,
  validateTaskWriteInput
} from "../lib/validation";
import { requireAuth } from "../middleware/auth";
import type { Handler } from "../middleware/error-handler";
import { DashboardService } from "../services/dashboard-service";
import { TaskService } from "../services/task-service";
import type { AuthenticatedUser } from "../types/api";
import type { Task, TaskRecord } from "../types/domain";

const requireUser = (user: AuthenticatedUser | undefined): AuthenticatedUser => {
  if (!user) throw unauthenticatedError();
  return user;
};

const assignmentResponse = (task: Task) => ({
  type: task.assignmentType,
  user: task.assignedUserId ? { userId: task.assignedUserId } : null
});

const taskResponse = (task: Task) => ({
  id: task.id,
  title: task.title,
  description: task.description,
  recurrenceType: task.recurrenceType,
  modelRecurrenceType: task.modelRecurrenceType,
  assignmentType: task.assignmentType,
  assignment: assignmentResponse(task),
  assignedUserId: task.assignedUserId,
  scheduledTime: task.scheduledTime,
  notificationSlot: task.notificationSlot,
  notificationTime: task.notificationTime,
  weekdays: task.weekdays,
  weeklyTargetCount: task.weeklyTargetCount,
  startDate: task.startDate,
  targetDate: task.targetDate,
  deadlineTime: task.deadlineTime,
  notificationOffsetMinutes: task.notificationOffsetMinutes,
  weeklyDeadlineWeekday: task.weeklyDeadlineWeekday,
  monthlyDayOfMonth: task.monthlyDayOfMonth,
  monthlyDeadlineDay: task.monthlyDeadlineType === "day_of_month" ? task.monthlyDayOfMonth : null,
  monthlyDeadlineType: task.monthlyDeadlineType,
  active: task.active,
  sortOrder: task.sortOrder,
  createdBy: task.createdBy,
  createdAt: task.createdAt,
  updatedAt: task.updatedAt
});

const recordResponse = (record: TaskRecord) => ({
  id: record.id,
  targetDate: record.targetDate,
  targetWeekStart: record.targetWeekStart,
  occurrenceKey: record.occurrenceKey,
  periodKey: record.periodKey,
  periodStart: record.periodKey ? record.periodKey.split(":").at(-2) ?? null : null,
  periodEnd: record.periodKey ? record.periodKey.split(":").at(-1) ?? null : null,
  status: record.status,
  actedBy: {
    userId: record.actedBy,
    displayName: record.actedByDisplayName
  },
  startedAt: record.startedAt,
  completedAt: record.completedAt,
  skippedAt: record.skippedAt,
  note: record.note,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt
});

export const listTasksRoute: Handler = requireAuth(async (context) => {
  const user = requireUser(context.user);
  const includeInactive = validateIncludeInactive(context.request);
  const tasks = await new TaskService(context.env.DB).listTasks(user.id, includeInactive);
  return okJson({ tasks: tasks.map(taskResponse) }, context.requestId);
});

export const createTaskRoute: Handler = requireAuth(async (context) => {
  const user = requireUser(context.user);
  const input = validateTaskWriteInput(await parseJsonBody(context.request));
  const task = await new TaskService(context.env.DB).createTask(user.id, input);
  return okJson({ task: taskResponse(task) }, context.requestId, { status: 201 });
});

export const getTaskRoute = (taskId: string): Handler =>
  requireAuth(async (context) => {
    const user = requireUser(context.user);
    const task = await new TaskService(context.env.DB).getTask(user.id, taskId);
    return okJson({ task: taskResponse(task) }, context.requestId);
  });

export const updateTaskRoute = (taskId: string): Handler =>
  requireAuth(async (context) => {
    const user = requireUser(context.user);
    const input = validateTaskPatchInput(await parseJsonBody(context.request));
    const task = await new TaskService(context.env.DB).updateTask(user.id, taskId, input);
    return okJson({ task: taskResponse(task) }, context.requestId);
  });

export const deleteTaskRoute = (taskId: string): Handler =>
  requireAuth(async (context) => {
    const user = requireUser(context.user);
    await new TaskService(context.env.DB).deactivateTask(user.id, taskId);
    return okJson({ deleted: true }, context.requestId);
  });

export const todayTasksRoute: Handler = requireAuth(async (context) => {
  const user = requireUser(context.user);
  const date = validateDateQuery(context.request, "date");
  const data = await new TaskService(context.env.DB).listToday(user.id, date);
  return okJson(
    {
      date: data.date,
      tasks: data.tasks.map((task) => ({
        ...taskResponse(task),
        status: task.status,
        actedBy: task.actedBy,
        startedAt: task.startedAt,
        completedAt: task.completedAt,
        skippedAt: task.skippedAt,
        note: task.note
        ,scopeKind: task.scopeKind,
        occurrenceKey: task.occurrenceKey,
        periodKey: task.periodKey,
        periodStart: task.periodStart,
        periodEnd: task.periodEnd,
        deadlineDate: task.deadlineDate,
        deadlineTime: task.deadlineTime,
        completedCount: task.completedCount,
        overdue: task.overdue
      }))
    },
    context.requestId
  );
});

export const weekTasksRoute: Handler = requireAuth(async (context) => {
  const user = requireUser(context.user);
  const weekStart = validateDateQuery(context.request, "weekStart");
  const data = await new TaskService(context.env.DB).listWeek(user.id, weekStart);
  return okJson(
    {
      weekStart: data.weekStart,
      weekEnd: data.weekEnd,
      tasks: data.tasks.map((task) => ({
        ...taskResponse(task),
        targetCount: task.targetCount,
        completedCount: task.completedCount,
        remainingCount: task.remainingCount,
        status: task.status,
        latestAction: task.latestAction ? recordResponse(task.latestAction) : null
      }))
    },
    context.requestId
  );
});

export const changeTaskStateRoute = (
  taskId: string,
  action: "start" | "complete" | "skip" | "reset"
): Handler =>
  requireAuth(async (context) => {
    const user = requireUser(context.user);
    const input = validateTaskStateInput(await parseJsonBody(context.request));
    const result = await new TaskService(context.env.DB).changeState(user.id, taskId, action, input);
    return okJson({ result }, context.requestId);
  });

export const taskHistoryRoute = (taskId: string): Handler =>
  requireAuth(async (context) => {
    const user = requireUser(context.user);
    const limit = validateLimitQuery(context.request, 20, 100);
    const records = await new TaskService(context.env.DB).listHistory(user.id, taskId, limit);
    return okJson({ records: records.map(recordResponse) }, context.requestId);
  });

export const dashboardTodayRoute: Handler = requireAuth(async (context) => {
  const user = requireUser(context.user);
  const date = validateDateQuery(context.request, "date");
  const data = await new DashboardService(context.env.DB).getToday(user.id, date);
  return okJson(data, context.requestId);
});
