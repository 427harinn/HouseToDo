import type { CreateTaskInput, Task, TaskAssignmentType, TaskModelRecurrenceType } from "./api/tasks";

export type TaskFormRecurrence = TaskModelRecurrenceType | "legacy_weekly";

export type TaskFormState = {
  title: string;
  description: string;
  recurrence: TaskFormRecurrence;
  assignmentType: TaskAssignmentType;
  assignedUserId: string | null;
  startDate: string;
  targetDate: string;
  deadlineTime: string;
  notificationOffsetMinutes: number | null;
  weekdays: number[];
  monthlyDayOfMonth: number | null;
  weeklyDeadlineWeekday: number;
  monthlyDeadlineType: "month_end" | "day_of_month";
  weeklyTargetCount: number;
  legacyScheduledTime: string;
  legacyNotificationTime: string;
};

export const defaultTaskForm = (): TaskFormState => ({
  title: "",
  description: "",
  recurrence: "daily",
  assignmentType: "anyone",
  assignedUserId: null,
  startDate: "",
  targetDate: "",
  deadlineTime: "",
  notificationOffsetMinutes: null,
  weekdays: [],
  monthlyDayOfMonth: 1,
  weeklyDeadlineWeekday: 0,
  monthlyDeadlineType: "month_end",
  weeklyTargetCount: 2,
  legacyScheduledTime: "",
  legacyNotificationTime: ""
});

export const taskToFormState = (task: Task): TaskFormState => {
  const legacyWeekly = !task.modelRecurrenceType && task.recurrenceType === "weekly" && (task.weeklyTargetCount ?? 1) > 1;
  const recurrence: TaskFormRecurrence = legacyWeekly
    ? "legacy_weekly"
    : task.modelRecurrenceType ?? (task.recurrenceType === "scheduled" ? "weekly_fixed" : task.recurrenceType === "weekly" ? "weekly_flexible" : "daily");
  return {
    ...defaultTaskForm(),
    title: task.title,
    description: task.description ?? "",
    recurrence,
    assignmentType: task.assignmentType,
    assignedUserId: task.assignedUserId,
    startDate: task.startDate ?? "",
    targetDate: task.targetDate ?? "",
    deadlineTime: task.deadlineTime ?? "",
    notificationOffsetMinutes: task.deadlineTime ? (task.notificationOffsetMinutes ?? null) : null,
    weekdays: [...task.weekdays],
    monthlyDayOfMonth: task.monthlyDayOfMonth ?? task.monthlyDeadlineDay ?? 1,
    weeklyDeadlineWeekday: task.weeklyDeadlineWeekday ?? 0,
    monthlyDeadlineType: task.monthlyDeadlineType ?? "month_end",
    weeklyTargetCount: task.weeklyTargetCount ?? 2,
    legacyScheduledTime: task.scheduledTime ?? "",
    legacyNotificationTime: task.notificationTime ?? ""
  };
};

export const changeTaskFormRecurrence = (state: TaskFormState, recurrence: TaskFormRecurrence): TaskFormState => ({
  ...state,
  recurrence,
  targetDate: recurrence === "once" ? state.targetDate : "",
  weekdays: recurrence === "weekly_fixed" ? state.weekdays : [],
  monthlyDayOfMonth: recurrence === "monthly_fixed" || recurrence === "monthly_flexible" ? (state.monthlyDayOfMonth ?? 1) : null,
  weeklyDeadlineWeekday: recurrence === "weekly_flexible" ? state.weeklyDeadlineWeekday : 0,
  monthlyDeadlineType: recurrence === "monthly_flexible" ? state.monthlyDeadlineType : "month_end",
  weeklyTargetCount: recurrence === "legacy_weekly" ? state.weeklyTargetCount : 2,
  legacyScheduledTime: recurrence === "legacy_weekly" ? state.legacyScheduledTime : "",
  legacyNotificationTime: recurrence === "legacy_weekly" ? state.legacyNotificationTime : ""
});

export const normalizeTaskForm = (state: TaskFormState): TaskFormState => ({
  ...state,
  description: state.description.trim(),
  assignedUserId: state.assignmentType === "specific" ? state.assignedUserId : null,
  notificationOffsetMinutes: state.deadlineTime ? state.notificationOffsetMinutes : null,
  weekdays: state.recurrence === "weekly_fixed" ? [...new Set(state.weekdays)].sort((a, b) => a - b) : []
});

export const taskFormToPayload = (raw: TaskFormState): CreateTaskInput => {
  const state = normalizeTaskForm(raw);
  if (state.recurrence === "legacy_weekly") return {
    title: state.title.trim(), description: state.description || null, recurrenceType: "weekly",
    assignmentType: state.assignmentType, assignedUserId: state.assignedUserId,
    scheduledTime: state.legacyScheduledTime || null, notificationSlot: "none",
    notificationTime: state.legacyNotificationTime || null, weekdays: [], weeklyTargetCount: state.weeklyTargetCount
  };
  return {
    title: state.title.trim(), description: state.description || null,
    recurrenceType: state.recurrence, modelRecurrenceType: state.recurrence,
    assignmentType: state.assignmentType, assignedUserId: state.assignedUserId,
    scheduledTime: null, notificationSlot: "none", notificationTime: null,
    weekdays: state.recurrence === "weekly_fixed" ? state.weekdays : [], weeklyTargetCount: null,
    startDate: state.recurrence === "once" ? (state.targetDate || null) : (state.startDate || null),
    targetDate: state.recurrence === "once" ? (state.targetDate || null) : null,
    deadlineTime: state.deadlineTime || null,
    notificationOffsetMinutes: state.deadlineTime ? state.notificationOffsetMinutes : null,
    weeklyDeadlineWeekday: state.recurrence === "weekly_flexible" ? state.weeklyDeadlineWeekday : null,
    monthlyDayOfMonth: state.recurrence === "monthly_fixed" || (state.recurrence === "monthly_flexible" && state.monthlyDeadlineType === "day_of_month") ? state.monthlyDayOfMonth : null,
    monthlyDeadlineDay: null,
    monthlyDeadlineType: state.recurrence === "monthly_flexible" ? state.monthlyDeadlineType : null
  };
};

export type TaskFormErrors = Partial<Record<keyof TaskFormState, string>>;

export const validateTaskFormState = (state: TaskFormState): TaskFormErrors => {
  const errors: TaskFormErrors = {};
  if (!state.title.trim()) errors.title = "タスク名を入力してください。";
  else if (state.title.trim().length > 100) errors.title = "タスク名は100文字以内で入力してください。";
  if (state.assignmentType === "specific" && !state.assignedUserId) errors.assignedUserId = "担当メンバーを選択してください。";
  if (state.recurrence === "once" && !state.targetDate) errors.targetDate = "実施日を選択してください。";
  if (state.recurrence === "weekly_fixed" && state.weekdays.length === 0) errors.weekdays = "曜日を1つ以上選択してください。";
  if (state.recurrence === "monthly_fixed" && (!Number.isInteger(state.monthlyDayOfMonth) || state.monthlyDayOfMonth! < 1 || state.monthlyDayOfMonth! > 31)) errors.monthlyDayOfMonth = "1〜31日で入力してください。";
  if (state.recurrence === "weekly_flexible" && (!Number.isInteger(state.weeklyDeadlineWeekday) || state.weeklyDeadlineWeekday < 0 || state.weeklyDeadlineWeekday > 6)) errors.weeklyDeadlineWeekday = "締め切り曜日を選択してください。";
  if (state.recurrence === "monthly_flexible" && state.monthlyDeadlineType === "day_of_month" && (!Number.isInteger(state.monthlyDayOfMonth) || state.monthlyDayOfMonth! < 1 || state.monthlyDayOfMonth! > 31)) errors.monthlyDayOfMonth = "1〜31日で入力してください。";
  if (!state.deadlineTime && state.notificationOffsetMinutes !== null) errors.notificationOffsetMinutes = "通知には締め切り時刻が必要です。";
  if (state.recurrence === "legacy_weekly" && (!Number.isInteger(state.weeklyTargetCount) || state.weeklyTargetCount < 2 || state.weeklyTargetCount > 7)) errors.weeklyTargetCount = "2〜7回で入力してください。";
  return errors;
};

export const notificationPresetLabel = (offset: number | null): string => {
  if (offset === null) return "通知なし";
  if (offset === 0) return "締め切り時刻に通知";
  if (offset === 60) return "1時間前に通知";
  if (offset === 120) return "2時間前に通知";
  return `${offset}分前に通知`;
};

export const recurrenceDescription = (task: Pick<Task, "modelRecurrenceType" | "recurrenceType" | "weekdays" | "monthlyDayOfMonth" | "weeklyDeadlineWeekday" | "monthlyDeadlineType">): string => {
  const type = task.modelRecurrenceType;
  if (!type) return task.recurrenceType === "weekly" ? "週に複数回（旧形式）" : "旧形式のタスク";
  if (type === "once") return "今回だけ";
  if (type === "daily") return "毎日";
  if (type === "weekly_fixed") return `毎週 ${task.weekdays.map((day) => ["日", "月", "火", "水", "木", "金", "土"][day]).join("・")}`;
  if (type === "monthly_fixed") return `毎月${task.monthlyDayOfMonth}日`;
  if (type === "weekly_flexible") return `週1回・日付不定（${["日", "月", "火", "水", "木", "金", "土"][task.weeklyDeadlineWeekday ?? 0]}曜まで）`;
  return `月1回・日付不定（${task.monthlyDeadlineType === "day_of_month" ? `${task.monthlyDayOfMonth}日まで` : "月末まで"}）`;
};
