import { unauthenticatedError, validationError } from "../lib/errors";
import { okJson } from "../lib/response";
import {
  parseJsonBody,
  validateCalendarRangeQuery,
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
import { ShoppingService } from "../services/shopping-service";
import { HouseholdService } from "../services/household-service";
import type { CompletedHistoryCursor } from "../repositories/task-record-repository";
import type { AuthenticatedUser } from "../types/api";
import type { ShoppingItem, Task, TaskRecord } from "../types/domain";

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

const calendarShoppingResponse = (item: ShoppingItem) => ({
  id: item.id,
  name: item.name,
  quantity: item.quantity,
  note: item.note,
  status: item.status,
  plannedPurchaseDate: item.plannedPurchaseDate,
  purchasedAt: item.purchasedAt,
  purchasedBy: item.purchasedBy
    ? { userId: item.purchasedBy, displayName: item.purchasedByDisplayName }
    : null
});

const recordResponse = (record: TaskRecord) => ({
  id: record.id,
  targetDate: record.targetDate,
  targetWeekStart: record.targetWeekStart,
  occurrenceKey: record.occurrenceKey,
  periodKey: record.periodKey,
  calendarActionDate: record.calendarActionDate,
  periodStart: record.periodKey ? record.periodKey.split(":").at(-2) ?? null : null,
  periodEnd: record.periodKey ? record.periodKey.split(":").at(-1) ?? null : null,
  status: record.status,
  actedBy: {
    userId: record.actedBy,
    displayName: record.actedByDisplayName,
    avatarUrl: record.actedByAvatarUrl
  },
  startedAt: record.startedAt,
  completedAt: record.completedAt,
  skippedAt: record.skippedAt,
  note: record.note,
  taskTitleSnapshot: record.taskTitleSnapshot,
  assignedUserIdSnapshot: record.assignedUserIdSnapshot,
  assignedUserDisplayNameSnapshot: record.assignedUserDisplayNameSnapshot,
  assignedUserColorSnapshot: record.assignedUserColorSnapshot,
  assignedUserAvatarUrlSnapshot: record.assignedUserAvatarUrlSnapshot,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt
});


export const taskWithStatusResponse = (task: Awaited<ReturnType<TaskService["listToday"]>>["tasks"][number]) => ({
  ...taskResponse(task),
  status: task.status,
  actedBy: task.actedBy,
  startedAt: task.startedAt,
  completedAt: task.completedAt,
  skippedAt: task.skippedAt,
  note: task.note,
  scopeKind: task.scopeKind,
  occurrenceKey: task.occurrenceKey,
  periodKey: task.periodKey,
  periodStart: task.periodStart,
  periodEnd: task.periodEnd,
  deadlineDate: task.deadlineDate,
  deadlineTime: task.deadlineTime,
  completedCount: task.completedCount,
  overdue: task.overdue
});

export const listTasksRoute: Handler = requireAuth(async (context) => {
  const user = requireUser(context.user);
  const includeInactive = validateIncludeInactive(context.request);
  const tasks = await new TaskService(context.env.DB).listTasks(user.id, includeInactive);
  return okJson({ tasks: tasks.map(taskResponse) }, context.requestId);
});

export const recentTasksRoute: Handler = requireAuth(async (context) => {
  const user = requireUser(context.user);
  const limit = validateLimitQuery(context.request, 8, 10);
  const tasks = await new TaskService(context.env.DB).listRecentTasks(user.id, limit);
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

const shoppingByDate = (items: ShoppingItem[]) => {
  const byDate = new Map<string, ShoppingItem[]>();
  for (const item of items) {
    if (!item.plannedPurchaseDate) continue;
    byDate.set(item.plannedPurchaseDate, [...(byDate.get(item.plannedPurchaseDate) ?? []), item]);
  }
  return byDate;
};

const calendarMarkersResponse = (
  data: Awaited<ReturnType<TaskService["listCalendarMarkersForHousehold"]>>,
  plannedShoppingItems: ShoppingItem[]
) => {
  const byDate = shoppingByDate(plannedShoppingItems);
  return {
    from: data.from,
    to: data.to,
    today: data.today,
    timezone: data.timezone,
    dates: Object.fromEntries(Object.entries(data.dates).map(([date, marker]) => {
      const planned = byDate.get(date) ?? [];
      return [date, { ...marker, shoppingCount: planned.length, purchasedShoppingCount: 0 }];
    }))
  };
};

const calendarSelectedResponse = (
  data: Awaited<ReturnType<TaskService["listCalendarSelectedForHousehold"]>>,
  plannedShoppingItems: ShoppingItem[]
) => ({
  today: data.today,
  timezone: data.timezone,
  selectedDate: data.selectedDate,
  selected: {
    fixed: data.selected.fixed.map(taskWithStatusResponse),
    weeklyFlexible: data.selected.weeklyFlexible.map(taskWithStatusResponse),
    monthlyFlexible: data.selected.monthlyFlexible.map(taskWithStatusResponse),
    completed: data.selected.completed.map((entry) => ({
      ...recordResponse(entry.record),
      taskId: entry.record.taskId,
      title: entry.record.taskTitleSnapshot ?? entry.task?.title ?? "家事",
      taskActive: entry.taskActive,
      selectedDate: entry.selectedDate,
      actualCompleter: {
        userId: entry.record.actedBy,
        displayName: entry.record.actedByDisplayName,
        avatarUrl: entry.record.actedByAvatarUrl
      }
    })),
    shopping: plannedShoppingItems
      .filter((item) => item.plannedPurchaseDate === data.selectedDate)
      .map(calendarShoppingResponse)
  }
});

const parseHistoryCursor = (request: Request): CompletedHistoryCursor | null => {
  const value = new URL(request.url).searchParams.get("cursor");
  if (value === null) return null;
  const separator = value.lastIndexOf("|");
  if (separator <= 0 || separator === value.length - 1) {
    throw validationError({ cursor: "cursor is invalid." });
  }
  const completedAt = value.slice(0, separator);
  const id = value.slice(separator + 1);
  if (!Number.isFinite(Date.parse(completedAt))) throw validationError({ cursor: "cursor is invalid." });
  return { completedAt, id };
};

const completedHistoryResponse = (entry: Awaited<ReturnType<TaskService["listCompletedHistory"]>>["records"][number]) => ({
  id: entry.record.id,
  taskId: entry.record.taskId,
  title: entry.record.taskTitleSnapshot ?? entry.task?.title ?? "家事",
  completedAt: entry.record.completedAt,
  actualCompleter: {
    userId: entry.record.actedBy,
    displayName: entry.record.actedByDisplayName,
    avatarUrl: entry.record.actedByAvatarUrl
  },
  taskActive: entry.taskActive
});

export const calendarRangeRoute: Handler = requireAuth(async (context) => {
  const user = requireUser(context.user);
  const query = validateCalendarRangeQuery(context.request);
  const household = await new HouseholdService(context.env.DB).requireCurrentHousehold(user.id);
  const taskService = new TaskService(context.env.DB);
  const shopping = new ShoppingService(context.env.DB);
  const [markers, plannedShoppingItems] = await Promise.all([
    taskService.listCalendarMarkersForHousehold(household, query.from, query.to),
    shopping.listPlannedItemsForHousehold(household, query.from, query.to)
  ]);
  return okJson(calendarMarkersResponse(markers, plannedShoppingItems), context.requestId);
});

export const calendarDayRoute: Handler = requireAuth(async (context) => {
  const user = requireUser(context.user);
  const date = validateDateQuery(context.request, "date");
  if (!date) throw validationError({ date: "date is required." });
  const household = await new HouseholdService(context.env.DB).requireCurrentHousehold(user.id);
  const taskService = new TaskService(context.env.DB);
  const shopping = new ShoppingService(context.env.DB);
  const [selected, plannedShoppingItems] = await Promise.all([
    taskService.listCalendarSelectedForHousehold(household, date),
    shopping.listPlannedItemsForHousehold(household, date, date)
  ]);
  return okJson(calendarSelectedResponse(selected, plannedShoppingItems), context.requestId);
});

export const calendarTasksRoute: Handler = requireAuth(async (context) => {
  const user = requireUser(context.user);
  const query = validateCalendarRangeQuery(context.request);
  const household = await new HouseholdService(context.env.DB).requireCurrentHousehold(user.id);
  const taskService = new TaskService(context.env.DB);
  const shopping = new ShoppingService(context.env.DB);
  const [data, plannedShoppingItems] = await Promise.all([
    taskService.listCalendarForHousehold(household, query.from, query.to, query.selectedDate),
    shopping.listPlannedItemsForHousehold(household, query.from, query.to)
  ]);
  const markers = calendarMarkersResponse(data, plannedShoppingItems);
  const selected = calendarSelectedResponse({
    today: data.today,
    timezone: data.timezone,
    selectedDate: data.selectedDate,
    selected: data.selected
  }, plannedShoppingItems);
  return okJson({
    ...markers,
    selectedDate: selected.selectedDate,
    selected: selected.selected
  }, context.requestId);
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

export const restoreTaskRecordRoute = (taskId: string): Handler =>
  requireAuth(async (context) => {
    const user = requireUser(context.user);
    const input = validateTaskStateInput(await parseJsonBody(context.request));
    if (!input.recordId) throw validationError({ recordId: "recordId is required." });
    const result = await new TaskService(context.env.DB).restoreRecord(user.id, taskId, input.recordId);
    return okJson({ result }, context.requestId);
  });

export const restoreCalendarTaskRecordRoute = (taskId: string): Handler =>
  requireAuth(async (context) => {
    const user = requireUser(context.user);
    const input = validateTaskStateInput(await parseJsonBody(context.request));
    if (!input.recordId || !input.calendarDate) throw validationError({ recordId: "recordId and calendarDate are required." });
    const result = await new TaskService(context.env.DB).restoreCalendarRecord(user.id, taskId, input.recordId, input.calendarDate);
    return okJson({ result }, context.requestId);
  });

export const taskHistoryRoute = (taskId: string): Handler =>
  requireAuth(async (context) => {
    const user = requireUser(context.user);
    const limit = validateLimitQuery(context.request, 20, 100);
    const records = await new TaskService(context.env.DB).listHistory(user.id, taskId, limit);
    return okJson({ records: records.map(recordResponse) }, context.requestId);
  });

export const completedTaskHistoryRoute: Handler = requireAuth(async (context) => {
  const user = requireUser(context.user);
  const limit = validateLimitQuery(context.request, 40, 100);
  const page = await new TaskService(context.env.DB).listCompletedHistory(user.id, limit, parseHistoryCursor(context.request));
  const nextCursor = page.nextCursor ? `${page.nextCursor.completedAt}|${page.nextCursor.id}` : null;
  return okJson({
    records: page.records.map(completedHistoryResponse),
    nextCursor
  }, context.requestId);
});

export const dashboardTodayRoute: Handler = requireAuth(async (context) => {
  const user = requireUser(context.user);
  const date = validateDateQuery(context.request, "date");
  const data = await new DashboardService(context.env.DB).getToday(user.id, date);
  return okJson(data, context.requestId);
});
