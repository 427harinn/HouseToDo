import { apiRequest } from "./client";
import type { ShoppingItemStatus } from "./shopping";

export type TaskRecurrenceType =
  | "daily"
  | "scheduled"
  | "weekly"
  | "once"
  | "weekly_fixed"
  | "monthly_fixed"
  | "weekly_flexible"
  | "monthly_flexible"
  | "model_only";
export type TaskModelRecurrenceType = "once" | "daily" | "weekly_fixed" | "monthly_fixed" | "weekly_flexible" | "monthly_flexible";
export type TaskAssignmentType = "anyone" | "specific";
export type NotificationSlot = "morning" | "night" | "none";
export type TaskDisplayStatus = "pending" | "in_progress" | "completed" | "skipped";

export type TaskActor = {
  userId: string;
  displayName: string | null;
};

export type Task = {
  id: string;
  title: string;
  description: string | null;
  recurrenceType: TaskRecurrenceType;
  modelRecurrenceType?: TaskModelRecurrenceType | null;
  assignmentType: TaskAssignmentType;
  assignedUserId: string | null;
  assignment: {
    type: TaskAssignmentType;
    user: { userId: string } | null;
  };
  scheduledTime: string | null;
  notificationSlot: NotificationSlot;
  notificationTime?: string | null;
  weekdays: number[];
  weeklyTargetCount: number | null;
  startDate?: string | null;
  targetDate?: string | null;
  deadlineTime?: string | null;
  notificationOffsetMinutes?: number | null;
  weeklyDeadlineWeekday?: number | null;
  monthlyDayOfMonth?: number | null;
  monthlyDeadlineDay?: number | null;
  monthlyDeadlineType?: "month_end" | "day_of_month" | null;
  active: boolean;
  sortOrder: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type TaskTemplate = {
  id: string;
  title: string;
  description: string | null;
  modelRecurrenceType: TaskModelRecurrenceType;
  assignmentType: TaskAssignmentType;
  assignedUserId: string | null;
  weekdays: number[];
  deadlineTime: string | null;
  notificationOffsetMinutes: number | null;
  weeklyDeadlineWeekday: number | null;
  monthlyDayOfMonth: number | null;
  monthlyDeadlineType: "month_end" | "day_of_month" | null;
  active: boolean;
  sortOrder: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type TodayTask = Task & {
  status: TaskDisplayStatus;
  actedBy: TaskActor | null;
  startedAt: string | null;
  completedAt: string | null;
  skippedAt: string | null;
  note: string | null;
  scopeKind?: "occurrence" | "period";
  displayGroup?: "today" | "week" | "month";
  occurrenceKey?: string | null;
  periodKey?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  deadlineDate?: string | null;
  completedCount?: number;
  overdue?: boolean;
};

export type HomeHistoryRecord = {
  id: string;
  taskId: string;
  status: "completed" | "skipped";
  title: string;
  taskActive: boolean;
  actualCompleter: { userId: string; displayName: string | null; avatarUrl: string | null };
  assignedUser: { userId: string; displayName: string | null; color: string | null; avatarUrl: string | null } | null;
  completedAt: string | null;
  skippedAt: string | null;
  targetDate: string | null;
  targetWeekStart: string | null;
  occurrenceKey?: string | null;
  periodKey?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TaskRecord = {
  id: string;
  taskId?: string;
  targetDate: string | null;
  targetWeekStart: string | null;
  status: Exclude<TaskDisplayStatus, "pending">;
  actedBy: TaskActor;
  startedAt: string | null;
  completedAt: string | null;
  skippedAt: string | null;
  note: string | null;
  calendarActionDate?: string | null;
  taskTitleSnapshot?: string | null;
  actualCompleter?: { userId: string; displayName: string | null; avatarUrl: string | null };
  createdAt: string;
  updatedAt: string;
};

export type WeeklyTask = Task & {
  targetCount: number;
  completedCount: number;
  remainingCount: number;
  status: TaskDisplayStatus;
  latestAction: TaskRecord | null;
  scopeKind?: "occurrence" | "period";
  displayGroup?: "today" | "week" | "month";
  occurrenceKey?: string | null;
  periodKey?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  deadlineDate?: string | null;
  deadlineTime?: string | null;
  overdue?: boolean;
};

export type CalendarDateMarker = {
  fixedCount: number;
  fixedCompletedCount: number;
  fixedSkippedCount: number;
  shoppingCount: number;
  purchasedShoppingCount: number;
  tasks: Array<{ id: string; title: string; deadline: boolean; status?: "pending" | "in_progress" | "completed" }>;
};

export type CalendarShoppingItem = {
  id: string;
  name: string;
  quantity: string | null;
  note: string | null;
  status: ShoppingItemStatus;
  plannedPurchaseDate: string | null;
  purchasedAt: string | null;
  purchasedBy: TaskActor | null;
};

export type CalendarResponse = {
  from: string;
  to: string;
  today: string;
  timezone: string;
  selectedDate: string;
  dates: Record<string, CalendarDateMarker>;
  selected: {
    fixed: TodayTask[];
    weeklyFlexible: TodayTask[];
    monthlyFlexible: TodayTask[];
    completed: CalendarCompletedRecord[];
    shopping: CalendarShoppingItem[];
  };
};

export type CalendarMarkersResponse = Pick<CalendarResponse, "from" | "to" | "today" | "timezone" | "dates">;
export type CalendarSelectedResponse = Pick<CalendarResponse, "today" | "timezone" | "selectedDate" | "selected">;

export type CalendarCompletedRecord = {
  id: string;
  taskId: string;
  title: string;
  taskActive: boolean;
  selectedDate: string;
  actualCompleter: { userId: string; displayName: string | null; avatarUrl: string | null };
  calendarActionDate?: string | null;
  targetDate: string | null;
  targetWeekStart: string | null;
  occurrenceKey?: string | null;
  periodKey?: string | null;
  status: "completed";
  completedAt: string | null;
};

export type CreateTaskInput = {
  title: string;
  description: string | null;
  recurrenceType: TaskRecurrenceType;
  modelRecurrenceType?: TaskModelRecurrenceType | null;
  assignmentType: TaskAssignmentType;
  assignedUserId: string | null;
  scheduledTime: string | null;
  notificationSlot: NotificationSlot;
  notificationTime?: string | null;
  weekdays: number[];
  weeklyTargetCount: number | null;
  startDate?: string | null;
  targetDate?: string | null;
  deadlineTime?: string | null;
  notificationOffsetMinutes?: number | null;
  weeklyDeadlineWeekday?: number | null;
  monthlyDayOfMonth?: number | null;
  monthlyDeadlineDay?: number | null;
  monthlyDeadlineType?: "month_end" | "day_of_month" | null;
};

export type UpdateTaskInput = Partial<CreateTaskInput>;

export type CreateTaskTemplateInput = {
  title: string;
  description: string | null;
  modelRecurrenceType: TaskModelRecurrenceType;
  assignmentType: TaskAssignmentType;
  assignedUserId: string | null;
  weekdays: number[];
  deadlineTime: string | null;
  notificationOffsetMinutes: number | null;
  weeklyDeadlineWeekday: number | null;
  monthlyDayOfMonth: number | null;
  monthlyDeadlineType: "month_end" | "day_of_month" | null;
};

export type TaskActionInput = {
  targetDate?: string;
  targetWeekStart?: string;
  note?: string | null;
  recordId?: string;
  calendarDate?: string;
};

const withQuery = (path: string, params: Record<string, string | boolean | number | undefined>) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) query.set(key, String(value));
  });
  const suffix = query.toString();
  return suffix ? `${path}?${suffix}` : path;
};

export const listRecentTaskDefinitions = (limit = 8, signal?: AbortSignal) =>
  apiRequest<{ tasks: Task[] }>(withQuery("/api/tasks/recent", { limit }), { signal });

export const createTask = (input: CreateTaskInput, signal?: AbortSignal) =>
  apiRequest<{ task: Task }>("/api/tasks", {
    method: "POST",
    body: JSON.stringify(input),
    signal
  });

export const getTask = (taskId: string, signal?: AbortSignal) =>
  apiRequest<{ task: Task }>(`/api/tasks/${taskId}`, { signal });

export const updateTask = (taskId: string, input: UpdateTaskInput, signal?: AbortSignal) =>
  apiRequest<{ task: Task }>(`/api/tasks/${taskId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
    signal
  });

export const deactivateTask = (taskId: string, signal?: AbortSignal) =>
  apiRequest<{ deleted: true }>(`/api/tasks/${taskId}`, {
    method: "DELETE",
    body: JSON.stringify({}),
    signal
  });

export const listCalendarTasks = (
  from: string,
  to: string,
  selectedDate?: string,
  signal?: AbortSignal
) =>
  apiRequest<CalendarResponse>(
    withQuery("/api/tasks/calendar", { from, to, selectedDate }),
    { signal }
  );

export const listCalendarMarkers = (
  from: string,
  to: string,
  signal?: AbortSignal
) =>
  apiRequest<CalendarMarkersResponse>(
    withQuery("/api/tasks/calendar/range", { from, to }),
    { signal }
  );

export const listCalendarSelected = (selectedDate: string, signal?: AbortSignal) =>
  apiRequest<CalendarSelectedResponse>(
    withQuery("/api/tasks/calendar/day", { date: selectedDate }),
    { signal }
  );

export const changeTaskState = (
  taskId: string,
  action: "start" | "complete" | "skip" | "reset",
  input: TaskActionInput,
  signal?: AbortSignal
) =>
  apiRequest<{ result: TodayTask | WeeklyTask | { reset: true } }>(`/api/tasks/${taskId}/${action}`, {
    method: "POST",
    body: JSON.stringify(input),
    signal
  });

export const restoreTaskRecord = (taskId: string, recordId: string, signal?: AbortSignal) =>
  apiRequest<{ result: { reset: true } }>(`/api/tasks/${taskId}/restore`, {
    method: "POST",
    body: JSON.stringify({ recordId }),
    signal
  });

export const restoreCalendarTaskRecord = (taskId: string, recordId: string, calendarDate: string, signal?: AbortSignal) =>
  apiRequest<{ result: { reset: true } }>(`/api/tasks/${taskId}/calendar-restore`, {
    method: "POST",
    body: JSON.stringify({ recordId, calendarDate }),
    signal
  });

export const listTaskHistory = (taskId: string, limit = 10, signal?: AbortSignal) =>
  apiRequest<{ records: TaskRecord[] }>(withQuery(`/api/tasks/${taskId}/history`, { limit }), {
    signal
  });
