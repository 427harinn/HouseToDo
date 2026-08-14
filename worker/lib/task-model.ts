import { addDateKey, getWeekday, isTaskScheduledForDate } from "./date-time";
import type { Task, TaskModelRecurrenceType } from "../types/domain";

export const TASK_MODEL_RECURRENCE_TYPES: readonly TaskModelRecurrenceType[] = ["once", "daily", "weekly_fixed", "monthly_fixed", "weekly_flexible", "monthly_flexible"];
export const NOTIFICATION_OFFSET_MINUTES = [null, 0, 5, 10, 30, 60, 120] as const;

export type TaskScope = {
  matchesDate: boolean;
  scopeType: "occurrence" | "period";
  occurrenceKey: string | null;
  periodKey: string | null;
  targetDate: string;
  periodStart: string;
  periodEnd: string;
  deadlineDate: string;
  deadlineTime: string | null;
  recurrenceType: TaskModelRecurrenceType | null;
};

const daysInMonth = (year: number, month: number): number =>
  Number(new Date(Date.UTC(year, month, 0)).getUTCDate());

const monthParts = (dateKey: string): { year: number; month: number; day: number } => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return { year, month, day };
};

const monthKey = (year: number, month: number, day: number): string =>
  `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

const monthDeadline = (year: number, month: number, task: Task): string => {
  const day = task.monthlyDeadlineType !== "day_of_month"
    ? daysInMonth(year, month)
    : Math.min(task.monthlyDayOfMonth ?? 1, daysInMonth(year, month));
  return monthKey(year, month, day);
};

export const resolveMonthlyDate = (year: number, month: number, day: number): string => monthKey(year, month, Math.min(day, daysInMonth(year, month)));

const previousMonth = (year: number, month: number): { year: number; month: number } =>
  month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };

const nextMonth = (year: number, month: number): { year: number; month: number } =>
  month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };

const flexibleMonthPeriod = (task: Task, targetDate: string): { start: string; end: string } => {
  const { year, month } = monthParts(targetDate);
  let end = monthDeadline(year, month, task);
  if (targetDate > end) {
    const next = nextMonth(year, month);
    end = monthDeadline(next.year, next.month, task);
  }
  const endParts = monthParts(end);
  const previous = previousMonth(endParts.year, endParts.month);
  let start = addDateKey(monthDeadline(previous.year, previous.month, task), 1);
  if (task.startDate && start < task.startDate) start = task.startDate;
  return { start, end };
};

const flexibleWeekPeriod = (task: Task, targetDate: string): { start: string; end: string } => {
  const deadlineWeekday = task.weeklyDeadlineWeekday ?? 0;
  const daysUntilDeadline = (deadlineWeekday - getWeekday(targetDate) + 7) % 7;
  const end = addDateKey(targetDate, daysUntilDeadline);
  let start = addDateKey(end, -6);
  if (task.startDate && start < task.startDate) start = task.startDate;
  return { start, end };
};

export const getWeeklyFlexiblePeriod = (dateKey: string, deadlineWeekday: number, startDate: string | null = null) => {
  const end = addDateKey(dateKey, (deadlineWeekday - getWeekday(dateKey) + 7) % 7);
  return { startDate: startDate && startDate > addDateKey(end, -6) ? startDate : addDateKey(end, -6), endDate: end, deadlineDate: end };
};

export const getMonthlyFlexiblePeriod = (dateKey: string, deadlineType: "month_end" | "day_of_month", dayOfMonth: number | null, startDate: string | null = null) => {
  const { year, month } = monthParts(dateKey);
  const task = { monthlyDeadlineType: deadlineType, monthlyDayOfMonth: dayOfMonth } as Task;
  const end = monthDeadline(year, month, task);
  const previous = previousMonth(year, month);
  const naturalStart = addDateKey(monthDeadline(previous.year, previous.month, task), 1);
  return { startDate: startDate && startDate > naturalStart ? startDate : naturalStart, endDate: end, deadlineDate: end };
};

export const isTaskModelOccurrenceOnDate = (input: { recurrenceType: TaskModelRecurrenceType; dateKey: string; startDate?: string | null; targetDate?: string | null; weekdays?: number[]; monthlyDayOfMonth?: number | null }): boolean => {
  if (input.startDate && input.dateKey < input.startDate) return false;
  if (input.recurrenceType === "once") return input.targetDate === input.dateKey;
  if (input.recurrenceType === "daily") return true;
  if (input.recurrenceType === "weekly_fixed") return (input.weekdays ?? []).includes(getWeekday(input.dateKey));
  if (input.recurrenceType === "monthly_fixed") { const { year, month } = monthParts(input.dateKey); return input.dateKey === resolveMonthlyDate(year, month, input.monthlyDayOfMonth ?? 1); }
  return true;
};

export const getStableTaskScopeKey = (input: { taskId: string; recurrenceType: TaskModelRecurrenceType; targetDate?: string; periodStart?: string; periodEnd?: string }): string =>
  ["once", "daily", "weekly_fixed", "monthly_fixed"].includes(input.recurrenceType)
    ? `occurrence:${input.taskId}:${input.targetDate}`
    : `period:${input.taskId}:${input.recurrenceType === "weekly_flexible" ? "week" : "month"}:${input.periodStart}:${input.periodEnd}`;

export const canonicalTaskType = (task: Task): TaskModelRecurrenceType | null => task.modelRecurrenceType ?? null;

export const projectTaskOnDate = (task: Task, targetDate: string): TaskScope => {
  const type = canonicalTaskType(task);
  if (!type) {
    const matches = task.recurrenceType === "daily"
      ? !task.startDate || targetDate >= task.startDate
      : task.recurrenceType === "scheduled" && (!task.startDate || targetDate >= task.startDate)
        ? isTaskScheduledForDate(task.weekdays, targetDate)
        : false;
    return {
      matchesDate: matches,
      scopeType: "occurrence",
      occurrenceKey: matches ? `occurrence:${task.id}:${targetDate}` : null,
      periodKey: null,
      targetDate,
      periodStart: targetDate,
      periodEnd: targetDate,
      deadlineDate: targetDate,
      deadlineTime: task.notificationTime,
      recurrenceType: null
    };
  }

  if (type === "once") {
    const matches = task.targetDate === targetDate;
    return { matchesDate: matches, scopeType: "occurrence", occurrenceKey: matches ? `occurrence:${task.id}:${targetDate}` : null, periodKey: null, targetDate, periodStart: targetDate, periodEnd: targetDate, deadlineDate: targetDate, deadlineTime: task.deadlineTime ?? null, recurrenceType: type };
  }
  if (type === "daily" || type === "weekly_fixed" || type === "monthly_fixed") {
    let matches = !task.startDate || targetDate >= task.startDate;
    if (type === "weekly_fixed") matches = matches && task.weekdays.includes(getWeekday(targetDate));
    if (type === "monthly_fixed") {
      const { year, month } = monthParts(targetDate);
      matches = matches && targetDate === monthKey(year, month, Math.min(task.monthlyDayOfMonth ?? 1, daysInMonth(year, month)));
    }
    return { matchesDate: matches, scopeType: "occurrence", occurrenceKey: matches ? `occurrence:${task.id}:${targetDate}` : null, periodKey: null, targetDate, periodStart: targetDate, periodEnd: targetDate, deadlineDate: targetDate, deadlineTime: task.deadlineTime ?? null, recurrenceType: type };
  }
  const period = type === "weekly_flexible" ? flexibleWeekPeriod(task, targetDate) : flexibleMonthPeriod(task, targetDate);
  const matches = targetDate >= period.start && targetDate <= period.end;
  const key = matches ? `period:${task.id}:${type === "weekly_flexible" ? "week" : "month"}:${period.start}:${period.end}` : null;
  return { matchesDate: matches, scopeType: "period", occurrenceKey: null, periodKey: key, targetDate, periodStart: period.start, periodEnd: period.end, deadlineDate: period.end, deadlineTime: task.deadlineTime ?? null, recurrenceType: type };
};
