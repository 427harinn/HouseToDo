import type { CreateTaskInput, CreateTaskTemplateInput, Task, TaskAssignmentType, TaskExecutionTiming, TaskModelRecurrenceType, TaskTemplate } from "./api/tasks";

export type TaskFormRecurrence = TaskModelRecurrenceType | "legacy_weekly";
export type TaskFormRecurrenceChoice = "once" | "daily" | "weekly" | "monthly";

export type TaskFormState = {
  title: string;
  description: string;
  recurrence: TaskFormRecurrence;
  executionTiming: TaskExecutionTiming;
  noSpecificDate: boolean;
  assignmentType: TaskAssignmentType;
  assignedUserId: string | null;
  startDate: string;
  targetDate: string;
  deadlineDate: string;
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
  recurrence: "once",
  executionTiming: "on_date",
  noSpecificDate: false,
  assignmentType: "anyone",
  assignedUserId: null,
  startDate: "",
  targetDate: "",
  deadlineDate: "",
  deadlineTime: "",
  notificationOffsetMinutes: null,
  weekdays: [],
  monthlyDayOfMonth: null,
  weeklyDeadlineWeekday: 0,
  monthlyDeadlineType: "month_end",
  weeklyTargetCount: 2,
  legacyScheduledTime: "",
  legacyNotificationTime: ""
});

const timingForRecurrence = (recurrence: TaskFormRecurrence): TaskExecutionTiming =>
  recurrence === "weekly_flexible" ? "this_week" : recurrence === "monthly_flexible" ? "this_month" : "on_date";

export const taskFormRecurrenceChoice = (state: Pick<TaskFormState, "recurrence">): TaskFormRecurrenceChoice => {
  if (state.recurrence === "daily") return "daily";
  if (state.recurrence === "weekly_fixed" || state.recurrence === "weekly_flexible") return "weekly";
  if (state.recurrence === "monthly_fixed" || state.recurrence === "monthly_flexible") return "monthly";
  return "once";
};

const dateParts = (dateKey: string): { day: number; weekday: number } | null => {
  const parsed = /^\d{4}-\d{2}-(\d{2})$/.exec(dateKey);
  if (!parsed) return null;
  const date = new Date(`${dateKey}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : { day: Number(parsed[1]), weekday: date.getUTCDay() };
};

const baseDateFor = (state: TaskFormState, baseDate = ""): string => state.startDate || state.targetDate || baseDate;

export const taskToFormState = (task: Task): TaskFormState => {
  const legacyWeekly = !task.modelRecurrenceType && task.recurrenceType === "weekly" && (task.weeklyTargetCount ?? 1) > 1;
  const recurrence: TaskFormRecurrence = legacyWeekly
    ? "legacy_weekly"
    : task.modelRecurrenceType ?? (task.recurrenceType === "scheduled" ? "weekly_fixed" : task.recurrenceType === "weekly" ? "weekly_flexible" : "daily");
  const canonicalDate = task.startDate ?? task.targetDate ?? "";
  const onceDate = recurrence === "once" ? task.targetDate ?? task.startDate ?? "" : "";
  const executionTiming: TaskExecutionTiming = task.executionTiming ?? timingForRecurrence(recurrence);
  const noSpecificDate = recurrence !== "daily" && recurrence !== "legacy_weekly" && executionTiming !== "on_date";
  return {
    ...defaultTaskForm(), title: task.title, description: task.description ?? "", recurrence, executionTiming, noSpecificDate,
    assignmentType: task.assignmentType, assignedUserId: task.assignedUserId, startDate: canonicalDate, targetDate: onceDate,
    deadlineDate: task.deadlineDate ?? "", deadlineTime: task.deadlineTime ?? "",
    notificationOffsetMinutes: task.deadlineTime ? (task.notificationOffsetMinutes ?? null) : null,
    weekdays: [...task.weekdays], monthlyDayOfMonth: task.monthlyDayOfMonth ?? task.monthlyDeadlineDay ?? 1,
    weeklyDeadlineWeekday: task.weeklyDeadlineWeekday ?? 0, monthlyDeadlineType: task.monthlyDeadlineType ?? "month_end",
    weeklyTargetCount: task.weeklyTargetCount ?? 2, legacyScheduledTime: task.scheduledTime ?? "", legacyNotificationTime: task.notificationTime ?? ""
  };
};

export const taskTemplateToFormState = (template: TaskTemplate): TaskFormState => {
  const executionTiming = template.executionTiming ?? timingForRecurrence(template.modelRecurrenceType);
  return {
    ...defaultTaskForm(), title: template.title, description: template.description ?? "", recurrence: template.modelRecurrenceType,
    executionTiming, noSpecificDate: template.modelRecurrenceType !== "daily" && executionTiming !== "on_date",
    assignmentType: template.assignmentType, assignedUserId: template.assignedUserId, weekdays: [...template.weekdays],
    deadlineTime: template.deadlineTime ?? "", deadlineDate: "", notificationOffsetMinutes: template.deadlineTime ? template.notificationOffsetMinutes : null,
    weeklyDeadlineWeekday: template.weeklyDeadlineWeekday ?? 0, monthlyDayOfMonth: template.monthlyDayOfMonth ?? 1,
    monthlyDeadlineType: template.monthlyDeadlineType ?? "month_end"
  };
};

export const changeTaskFormRecurrence = (state: TaskFormState, recurrence: TaskFormRecurrence, baseDate = ""): TaskFormState => {
  const date = baseDateFor(state, baseDate);
  const parts = dateParts(date);
  const noSpecificDate = recurrence === "weekly_flexible" || recurrence === "monthly_flexible"
    ? true : recurrence === "once" ? state.noSpecificDate && state.executionTiming !== "on_date" : false;
  const executionTiming = noSpecificDate ? (recurrence === "weekly_flexible" ? "this_week" : recurrence === "monthly_flexible" ? "this_month" : state.executionTiming) : timingForRecurrence(recurrence);
  return {
    ...state, recurrence, executionTiming, noSpecificDate,
    targetDate: recurrence === "once" && executionTiming === "on_date" ? date : "",
    deadlineDate: executionTiming === "by_deadline" ? state.deadlineDate : "",
    weekdays: recurrence === "weekly_fixed" ? (state.weekdays.length > 0 ? state.weekdays : parts ? [parts.weekday] : []) : [],
    monthlyDayOfMonth: recurrence === "monthly_fixed" || recurrence === "monthly_flexible" ? (state.monthlyDayOfMonth ?? parts?.day ?? 1) : null,
    weeklyDeadlineWeekday: recurrence === "weekly_flexible" ? state.weeklyDeadlineWeekday : 0,
    monthlyDeadlineType: recurrence === "monthly_flexible" ? state.monthlyDeadlineType : "month_end",
    weeklyTargetCount: recurrence === "legacy_weekly" ? state.weeklyTargetCount : 2,
    legacyScheduledTime: recurrence === "legacy_weekly" ? state.legacyScheduledTime : "",
    legacyNotificationTime: recurrence === "legacy_weekly" ? state.legacyNotificationTime : ""
  };
};

export const changeTaskFormNoSpecificDate = (state: TaskFormState, enabled: boolean, baseDate = ""): TaskFormState => {
  const choice = taskFormRecurrenceChoice(state);
  if (choice === "daily" || state.recurrence === "legacy_weekly") return { ...state, noSpecificDate: false, executionTiming: "on_date" };
  const date = baseDateFor(state, baseDate);
  const parts = dateParts(date);
  if (!enabled) {
    const recurrence: TaskFormRecurrence = choice === "weekly" ? "weekly_fixed" : choice === "monthly" ? "monthly_fixed" : "once";
    return {
      ...state, recurrence, noSpecificDate: false, executionTiming: "on_date", startDate: state.startDate || baseDate,
      targetDate: recurrence === "once" ? date : "", deadlineDate: "",
      weekdays: choice === "weekly" ? (state.weekdays.length > 0 ? state.weekdays : parts ? [parts.weekday] : []) : [],
      monthlyDayOfMonth: choice === "monthly" ? (state.monthlyDayOfMonth ?? parts?.day ?? 1) : null,
      weeklyDeadlineWeekday: 0, monthlyDeadlineType: "month_end"
    };
  }
  const recurrence: TaskFormRecurrence = choice === "weekly" ? "weekly_flexible" : choice === "monthly" ? "monthly_flexible" : "once";
  const executionTiming = choice === "weekly" ? "this_week" : choice === "monthly" ? "this_month" : state.executionTiming === "by_deadline" || state.executionTiming === "this_week" || state.executionTiming === "this_month" ? state.executionTiming : "this_month";
  return {
    ...state, recurrence, noSpecificDate: true, executionTiming, targetDate: "", weekdays: [], monthlyDayOfMonth: null,
    weeklyDeadlineWeekday: recurrence === "weekly_flexible" ? state.weeklyDeadlineWeekday : 0,
    monthlyDeadlineType: recurrence === "monthly_flexible" ? state.monthlyDeadlineType : "month_end"
  };
};

export const normalizeTaskForm = (state: TaskFormState): TaskFormState => {
  const canonicalDate = state.startDate || state.targetDate;
  const noSpecificDate = state.recurrence === "daily" || state.recurrence === "legacy_weekly" ? false : state.noSpecificDate;
  const executionTiming = state.recurrence === "weekly_flexible" ? "this_week" : state.recurrence === "monthly_flexible" ? "this_month" : state.recurrence === "daily" || state.recurrence === "weekly_fixed" || state.recurrence === "monthly_fixed" ? "on_date" : noSpecificDate ? state.executionTiming : "on_date";
  return {
    ...state, noSpecificDate, executionTiming, description: state.description.trim(), assignedUserId: state.assignmentType === "specific" ? state.assignedUserId : null,
    startDate: canonicalDate, targetDate: state.recurrence === "once" && executionTiming === "on_date" ? canonicalDate : "",
    deadlineDate: executionTiming === "by_deadline" ? state.deadlineDate : "", notificationOffsetMinutes: state.deadlineTime ? state.notificationOffsetMinutes : null,
    weekdays: state.recurrence === "weekly_fixed" ? [...new Set(state.weekdays)].sort((a, b) => a - b) : []
  };
};

export const taskFormToPayload = (raw: TaskFormState): CreateTaskInput => {
  const state = normalizeTaskForm(raw);
  if (state.recurrence === "legacy_weekly") return {
    title: state.title.trim(), description: state.description || null, recurrenceType: "weekly", assignmentType: state.assignmentType, assignedUserId: state.assignedUserId,
    scheduledTime: state.legacyScheduledTime || null, notificationSlot: "none", notificationTime: state.legacyNotificationTime || null, weekdays: [], weeklyTargetCount: state.weeklyTargetCount
  };
  return {
    title: state.title.trim(), description: state.description || null, recurrenceType: state.recurrence, modelRecurrenceType: state.recurrence,
    assignmentType: state.assignmentType, assignedUserId: state.assignedUserId, scheduledTime: null, notificationSlot: "none", notificationTime: null,
    weekdays: state.recurrence === "weekly_fixed" ? state.weekdays : [], weeklyTargetCount: null,
    startDate: state.startDate || (state.recurrence === "once" ? state.targetDate : "") || null,
    targetDate: state.recurrence === "once" && state.executionTiming === "on_date" ? (state.startDate || state.targetDate || null) : null,
    executionTiming: state.executionTiming, deadlineDate: state.executionTiming === "by_deadline" ? (state.deadlineDate || null) : null,
    deadlineTime: state.deadlineTime || null, notificationOffsetMinutes: state.deadlineTime ? state.notificationOffsetMinutes : null,
    weeklyDeadlineWeekday: state.recurrence === "weekly_flexible" ? state.weeklyDeadlineWeekday : null,
    monthlyDayOfMonth: state.recurrence === "monthly_fixed" || (state.recurrence === "monthly_flexible" && state.monthlyDeadlineType === "day_of_month") ? state.monthlyDayOfMonth : null,
    monthlyDeadlineDay: null, monthlyDeadlineType: state.recurrence === "monthly_flexible" ? state.monthlyDeadlineType : null
  };
};

export const taskToTemplatePayload = (task: Task): CreateTaskTemplateInput | null => task.modelRecurrenceType ? taskFormToTemplatePayload(taskToFormState(task)) : null;

export const taskFormToTemplatePayload = (raw: TaskFormState): CreateTaskTemplateInput => {
  const state = normalizeTaskForm(raw);
  return {
    title: state.title.trim(), description: state.description || null, modelRecurrenceType: state.recurrence as TaskModelRecurrenceType,
    executionTiming: state.executionTiming, deadlineDate: null, assignmentType: state.assignmentType, assignedUserId: state.assignedUserId,
    weekdays: state.recurrence === "weekly_fixed" ? state.weekdays : [], deadlineTime: state.deadlineTime || null,
    notificationOffsetMinutes: state.deadlineTime ? state.notificationOffsetMinutes : null,
    weeklyDeadlineWeekday: state.recurrence === "weekly_flexible" ? state.weeklyDeadlineWeekday : null,
    monthlyDayOfMonth: state.recurrence === "monthly_fixed" || (state.recurrence === "monthly_flexible" && state.monthlyDeadlineType === "day_of_month") ? state.monthlyDayOfMonth : null,
    monthlyDeadlineType: state.recurrence === "monthly_flexible" ? state.monthlyDeadlineType : null
  };
};

export type TaskFormErrors = Partial<Record<keyof TaskFormState, string>>;

export const validateTaskFormState = (state: TaskFormState, options: { template?: boolean } = {}): TaskFormErrors => {
  const errors: TaskFormErrors = {};
  if (!state.title.trim()) errors.title = "タスク名を入力してください。";
  else if (state.title.trim().length > 100) errors.title = "タスク名は100文字以内で入力してください。";
  if (state.assignmentType === "specific" && !state.assignedUserId) errors.assignedUserId = "担当メンバーを選択してください。";
  if (state.recurrence === "daily" && state.noSpecificDate) errors.noSpecificDate = "毎日は日にちを決めない設定にできません。";
  if (state.recurrence === "once" && state.noSpecificDate && state.executionTiming === "on_date") errors.executionTiming = "日にちを決めない場合は期間または期限を選択してください。";
  if (state.recurrence === "once" && !state.noSpecificDate && state.executionTiming !== "on_date") errors.noSpecificDate = "期間を使う場合は日にちを決めない設定をオンにしてください。";
  if (state.recurrence === "weekly_fixed" && state.executionTiming !== "on_date") errors.executionTiming = "固定の毎週設定には固定日を指定してください。";
  if (state.recurrence === "monthly_fixed" && state.executionTiming !== "on_date") errors.executionTiming = "固定の毎月設定には固定日を指定してください。";
  if (state.recurrence === "weekly_flexible" && !state.noSpecificDate) errors.noSpecificDate = "毎週の期間設定には日にちを決めない設定が必要です。";
  if (state.recurrence === "monthly_flexible" && !state.noSpecificDate) errors.noSpecificDate = "毎月の期間設定には日にちを決めない設定が必要です。";
  if (!options.template && state.recurrence === "once" && state.executionTiming === "on_date" && !(state.startDate || state.targetDate)) errors.startDate = "日付を選択してください。";
  if (state.recurrence === "once" && state.executionTiming === "by_deadline" && !options.template && !state.deadlineDate) errors.deadlineDate = "期限を選択してください。";
  if (state.recurrence === "once" && state.executionTiming === "by_deadline" && state.startDate && state.deadlineDate && state.deadlineDate < state.startDate) errors.deadlineDate = "期限は開始日以降で指定してください。";
  if (state.recurrence === "weekly_fixed" && state.weekdays.length === 0) errors.weekdays = "曜日を1つ以上選択してください。";
  if (state.recurrence === "monthly_fixed" && (!Number.isInteger(state.monthlyDayOfMonth) || state.monthlyDayOfMonth! < 1 || state.monthlyDayOfMonth! > 31)) errors.monthlyDayOfMonth = "1〜31日で入力してください。";
  if (state.recurrence === "weekly_flexible" && state.executionTiming !== "this_week") errors.executionTiming = "毎週の日にち未定は今週中で指定してください。";
  if (state.recurrence === "monthly_flexible" && state.executionTiming !== "this_month") errors.executionTiming = "毎月の日にち未定は今月中で指定してください。";
  if (state.recurrence === "weekly_flexible" && (!Number.isInteger(state.weeklyDeadlineWeekday) || state.weeklyDeadlineWeekday < 0 || state.weeklyDeadlineWeekday > 6)) errors.weeklyDeadlineWeekday = "締め切り曜日を選択してください。";
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
  if (type === "weekly_flexible") return "毎週";
  return "毎月";
};

export const executionTimingLabel = (timing: TaskExecutionTiming): string => ({ on_date: "固定日", this_week: "今週中", this_month: "今月中", by_deadline: "期限を指定" }[timing]);
