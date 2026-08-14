import { apiRequest } from "./client";

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

export type TaskRecord = {
  id: string;
  targetDate: string | null;
  targetWeekStart: string | null;
  status: Exclude<TaskDisplayStatus, "pending">;
  actedBy: TaskActor;
  startedAt: string | null;
  completedAt: string | null;
  skippedAt: string | null;
  note: string | null;
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
  };
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

export type TaskActionInput = {
  targetDate?: string;
  targetWeekStart?: string;
  note?: string | null;
};

const withQuery = (path: string, params: Record<string, string | boolean | number | undefined>) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) query.set(key, String(value));
  });
  const suffix = query.toString();
  return suffix ? `${path}?${suffix}` : path;
};

export const listTasks = (includeInactive = false, signal?: AbortSignal) =>
  apiRequest<{ tasks: Task[] }>(withQuery("/api/tasks", { includeInactive }), { signal });

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

export const listTodayTasks = (date?: string, signal?: AbortSignal) =>
  apiRequest<{ date: string; tasks: TodayTask[] }>(withQuery("/api/tasks/today", { date }), {
    signal
  });

export const listWeekTasks = (weekStart?: string, signal?: AbortSignal) =>
  apiRequest<{ weekStart: string; weekEnd: string; tasks: WeeklyTask[] }>(
    withQuery("/api/tasks/week", { weekStart }),
    { signal }
  );

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

export const listTaskHistory = (taskId: string, limit = 10, signal?: AbortSignal) =>
  apiRequest<{ records: TaskRecord[] }>(withQuery(`/api/tasks/${taskId}/history`, { limit }), {
    signal
  });
