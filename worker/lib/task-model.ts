import {
  addDateKey,
  getWeekday,
  isValidDateKey
} from "./date-time";
import type {
  MonthlyDeadlineType,
  TaskModelRecurrenceType
} from "../types/domain";

export const TASK_MODEL_RECURRENCE_TYPES: readonly TaskModelRecurrenceType[] = [
  "once",
  "daily",
  "weekly_fixed",
  "monthly_fixed",
  "weekly_flexible",
  "monthly_flexible"
];

export const NOTIFICATION_OFFSET_MINUTES = [0, 5, 10, 30, 60, 120] as const;
export type NotificationOffsetMinutes = (typeof NOTIFICATION_OFFSET_MINUTES)[number];

export type WeeklyFlexiblePeriod = {
  startDate: string;
  endDate: string;
  deadlineDate: string;
};

export type MonthlyFlexiblePeriod = {
  startDate: string;
  endDate: string;
  deadlineDate: string;
};

const daysInMonth = (year: number, month: number): number =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

const dateParts = (dateKey: string): { year: number; month: number; day: number } => {
  if (!isValidDateKey(dateKey)) throw new Error("Invalid date key");
  const [year, month, day] = dateKey.split("-").map(Number);
  return { year, month, day };
};

const formatDate = (year: number, month: number, day: number): string =>
  `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

export const clampDayOfMonth = (year: number, month: number, day: number): number =>
  Math.min(day, daysInMonth(year, month));

export const resolveMonthlyDate = (year: number, month: number, day: number): string =>
  formatDate(year, month, clampDayOfMonth(year, month, day));

export const resolveMonthlyDeadlineDate = (
  year: number,
  month: number,
  deadlineType: MonthlyDeadlineType,
  deadlineDay: number | null
): string => {
  if (deadlineType === "month_end") return formatDate(year, month, daysInMonth(year, month));
  if (deadlineDay === null) throw new Error("day_of_month requires a deadline day");
  return resolveMonthlyDate(year, month, deadlineDay);
};

const firstDateOfMonth = (dateKey: string): string => {
  const { year, month } = dateParts(dateKey);
  return formatDate(year, month, 1);
};

export const getWeeklyFlexiblePeriod = (
  dateKey: string,
  deadlineWeekday: number,
  startDate: string
): WeeklyFlexiblePeriod | null => {
  if (!isValidDateKey(startDate)) throw new Error("Invalid start date");
  if (!Number.isInteger(deadlineWeekday) || deadlineWeekday < 0 || deadlineWeekday > 6) {
    throw new Error("Invalid deadline weekday");
  }
  const daysUntilDeadline = (deadlineWeekday - getWeekday(dateKey) + 7) % 7;
  const deadlineDate = addDateKey(dateKey, daysUntilDeadline);
  const naturalStartDate = addDateKey(deadlineDate, -6);
  const periodStart = startDate > naturalStartDate ? startDate : naturalStartDate;
  if (periodStart > deadlineDate) return null;
  return { startDate: periodStart, endDate: deadlineDate, deadlineDate };
};

export const getMonthlyFlexiblePeriod = (
  dateKey: string,
  deadlineType: MonthlyDeadlineType,
  deadlineDay: number | null,
  startDate: string
): MonthlyFlexiblePeriod | null => {
  if (!isValidDateKey(startDate)) throw new Error("Invalid start date");
  const { year, month } = dateParts(dateKey);
  const deadlineDate = resolveMonthlyDeadlineDate(year, month, deadlineType, deadlineDay);
  const periodStart = startDate > firstDateOfMonth(dateKey) ? startDate : firstDateOfMonth(dateKey);
  if (periodStart > deadlineDate) return null;
  return { startDate: periodStart, endDate: deadlineDate, deadlineDate };
};

export const isTaskModelOccurrenceOnDate = (input: {
  recurrenceType: TaskModelRecurrenceType;
  dateKey: string;
  startDate: string;
  targetDate?: string | null;
  weekdays?: number[];
  monthlyDayOfMonth?: number | null;
}): boolean => {
  if (input.dateKey < input.startDate) return false;
  switch (input.recurrenceType) {
    case "once":
      return input.targetDate === input.dateKey;
    case "daily":
      return true;
    case "weekly_fixed":
      return (input.weekdays ?? []).includes(getWeekday(input.dateKey));
    case "monthly_fixed": {
      if (input.monthlyDayOfMonth === null || input.monthlyDayOfMonth === undefined) return false;
      const { year, month } = dateParts(input.dateKey);
      return resolveMonthlyDate(year, month, input.monthlyDayOfMonth) === input.dateKey;
    }
    case "weekly_flexible":
    case "monthly_flexible":
      return true;
  }
};

export const getStableTaskScopeKey = (input: {
  taskId: string;
  recurrenceType: TaskModelRecurrenceType;
  targetDate?: string;
  periodStart?: string;
  periodEnd?: string;
}): string => {
  if (["once", "daily", "weekly_fixed", "monthly_fixed"].includes(input.recurrenceType)) {
    if (!input.targetDate) throw new Error("Fixed task scope requires target date");
    return `occurrence:${input.taskId}:${input.targetDate}`;
  }
  if (!input.periodStart || !input.periodEnd) throw new Error("Flexible task scope requires period dates");
  const periodName = input.recurrenceType === "weekly_flexible" ? "week" : "month";
  return `period:${input.taskId}:${periodName}:${input.periodStart}:${input.periodEnd}`;
};
