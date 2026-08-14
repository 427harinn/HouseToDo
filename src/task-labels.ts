import type {
  NotificationSlot,
  TaskAssignmentType,
  TaskDisplayStatus
} from "./api/tasks";

export const recurrenceLabels: Record<string, string> = {
  daily: "毎日のタスク",
  scheduled: "曜日指定タスク",
  weekly: "今週中のタスク",
  once: "今回だけ",
  weekly_fixed: "曜日を決める",
  monthly_fixed: "毎月○日",
  weekly_flexible: "週1回・日付不定",
  monthly_flexible: "月1回・日付不定"
};

recurrenceLabels.model_only = "API-only task";

export const assignmentLabels: Record<TaskAssignmentType, string> = {
  anyone: "どちらでも",
  specific: "特定のメンバー"
};

export const notificationLabels: Record<NotificationSlot, string> = {
  morning: "朝",
  night: "夜",
  none: "通知なし"
};

export const statusLabels: Record<TaskDisplayStatus, string> = {
  pending: "未完了",
  in_progress: "対応中",
  completed: "完了",
  skipped: "パス"
};

export const weekdayLabels = ["日", "月", "火", "水", "木", "金", "土"];

export const formatWeekdays = (weekdays: number[]) =>
  weekdays.length > 0 ? weekdays.map((day) => weekdayLabels[day] ?? String(day)).join("・") : "指定なし";

export const formatSchedule = (scheduledTime: string | null) =>
  scheduledTime ? scheduledTime : "時間指定なし";
