import { validationError } from "./errors";
import { getLocalDate } from "./date-time";
import { validateTaskPatchInput, validateTaskWriteInput } from "./validation";
import { HouseholdService } from "../services/household-service";
import type { Task } from "../types/domain";
import type { TaskPatchInput, TaskWriteInput } from "./validation";

export const MCP_WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday"
] as const;

const weekdayIndex = new Map(MCP_WEEKDAYS.map((day, index) => [day, (index + 1) % 7]));
const minutesBeforePresets = [0, 5, 10, 30, 60, 120] as const;

type MuseRecurrence = {
  type:
    | "once"
    | "daily"
    | "weekly"
    | "weekly_count"
    | "weekly_flexible"
    | "monthly"
    | "monthly_flexible"
    | "this_week"
    | "this_month"
    | "deadline";
  weekdays?: unknown;
  count?: unknown;
  dayOfMonth?: unknown;
  deadlineWeekday?: unknown;
  monthDeadline?: unknown;
  date?: unknown;
};

type JsonObject = Record<string, unknown>;

const object = (value: unknown): JsonObject | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : null;

const hasOwn = (value: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const invalid = (field: string, message: string): never => {
  throw validationError({ [field]: message });
};

const parseTime = (value: unknown, field = "time"): string | null => {
  if (value === undefined) return null;
  if (value === null) return null;
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value))
    return invalid(field, `${field} must use HH:mm format.`);
  return value;
};

const parseNotification = (
  value: unknown
): { enabled: boolean; minutesBefore: number | null } => {
  if (value === undefined) return { enabled: false, minutesBefore: null };
  const notification = object(value);
  if (
    !notification ||
    Object.keys(notification).some((key) => !["enabled", "minutesBefore"].includes(key))
  )
    return invalid(
      "notification",
      "notification must contain enabled and minutesBefore only."
    );
  if (typeof notification.enabled !== "boolean")
    return invalid(
      "notification.enabled",
      "notification.enabled must be true or false."
    );
  if (!notification.enabled) {
    if (notification.minutesBefore !== undefined && notification.minutesBefore !== null)
      return invalid(
        "notification.minutesBefore",
        "minutesBefore must be omitted when notification is disabled."
      );
    return { enabled: false, minutesBefore: null };
  }
  if (
    typeof notification.minutesBefore !== "number" ||
    !minutesBeforePresets.includes(
      notification.minutesBefore as (typeof minutesBeforePresets)[number]
    )
  )
    return invalid(
      "notification.minutesBefore",
      "Use one of 0, 5, 10, 30, 60, or 120 minutes."
    );
  return { enabled: true, minutesBefore: notification.minutesBefore };
};

const parseRecurrence = (value: unknown): MuseRecurrence => {
  const recurrence = object(value);
  if (
    !recurrence ||
    ![
      "once",
      "daily",
      "weekly",
      "weekly_count",
      "weekly_flexible",
      "monthly",
      "monthly_flexible",
      "this_week",
      "this_month",
      "deadline"
    ].includes(String(recurrence.type))
  )
    return invalid("recurrence", "Choose a supported recurrence type.");
  const allowed = new Set([
    "type",
    "weekdays",
    "count",
    "dayOfMonth",
    "deadlineWeekday",
    "monthDeadline",
    "date"
  ]);
  const unknown = Object.keys(recurrence).find((key) => !allowed.has(key));
  if (unknown) return invalid(`recurrence.${unknown}`, "Unsupported recurrence field.");
  const type = recurrence.type as MuseRecurrence["type"];
  const requiredKeys: Partial<Record<MuseRecurrence["type"], string[]>> = {
    weekly: ["weekdays"],
    weekly_count: ["count"],
    monthly: ["dayOfMonth"],
    deadline: ["date"]
  };
  for (const key of requiredKeys[type] ?? [])
    if (!hasOwn(recurrence, key))
      invalid(`recurrence.${key}`, `${key} is required for ${type}.`);
  if (type !== "weekly" && recurrence.weekdays !== undefined)
    invalid("recurrence.weekdays", "weekdays are only used by weekly recurrence.");
  if (type !== "weekly_count" && recurrence.count !== undefined)
    invalid("recurrence.count", "count is only used by weekly_count recurrence.");
  if (
    type !== "monthly" &&
    type !== "monthly_flexible" &&
    recurrence.dayOfMonth !== undefined
  )
    invalid("recurrence.dayOfMonth", "dayOfMonth is only used by monthly recurrence.");
  if (type !== "weekly_flexible" && recurrence.deadlineWeekday !== undefined)
    invalid(
      "recurrence.deadlineWeekday",
      "deadlineWeekday is only used by weekly_flexible recurrence."
    );
  if (type !== "monthly_flexible" && recurrence.monthDeadline !== undefined)
    invalid(
      "recurrence.monthDeadline",
      "monthDeadline is only used by monthly_flexible recurrence."
    );
  if (
    type === "monthly_flexible" &&
    recurrence.monthDeadline === "day_of_month" &&
    recurrence.dayOfMonth === undefined
  )
    invalid(
      "recurrence.dayOfMonth",
      "dayOfMonth is required for a day_of_month deadline."
    );
  if (
    type === "monthly_flexible" &&
    recurrence.monthDeadline === "month_end" &&
    recurrence.dayOfMonth !== undefined
  )
    invalid(
      "recurrence.dayOfMonth",
      "Do not provide dayOfMonth for a month_end deadline."
    );
  if (
    type === "monthly_flexible" &&
    recurrence.monthDeadline === undefined &&
    recurrence.dayOfMonth !== undefined
  )
    invalid(
      "recurrence.monthDeadline",
      "Set monthDeadline to day_of_month when providing dayOfMonth."
    );
  if (
    recurrence.deadlineWeekday !== undefined &&
    (typeof recurrence.deadlineWeekday !== "string" ||
      !weekdayIndex.has(recurrence.deadlineWeekday as (typeof MCP_WEEKDAYS)[number]))
  )
    invalid(
      "recurrence.deadlineWeekday",
      `Use weekday names: ${MCP_WEEKDAYS.join(", ")}.`
    );
  if (
    recurrence.monthDeadline !== undefined &&
    (typeof recurrence.monthDeadline !== "string" ||
      !["month_end", "day_of_month"].includes(recurrence.monthDeadline))
  )
    invalid(
      "recurrence.monthDeadline",
      "monthDeadline must be month_end or day_of_month."
    );
  if (type !== "deadline" && recurrence.date !== undefined)
    invalid("recurrence.date", "date is only used by deadline recurrence.");
  return recurrence as MuseRecurrence;
};

const parseWeekdays = (value: unknown): number[] => {
  if (!Array.isArray(value) || value.length === 0)
    return invalid("recurrence.weekdays", "Choose at least one weekday.");
  const days: number[] = [];
  for (const item of value) {
    if (
      typeof item !== "string" ||
      !weekdayIndex.has(item as (typeof MCP_WEEKDAYS)[number])
    )
      return invalid(
        "recurrence.weekdays",
        `Use weekday names: ${MCP_WEEKDAYS.join(", ")}.`
      );
    days.push(weekdayIndex.get(item as (typeof MCP_WEEKDAYS)[number])!);
  }
  if (new Set(days).size !== days.length)
    return invalid("recurrence.weekdays", "Do not repeat weekdays.");
  return days.sort((left, right) => left - right);
};

const parseDate = (value: unknown, field: string): string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return invalid(field, `${field} must use YYYY-MM-DD format.`);
  // The shared task validator performs the calendar-date check.
  return value;
};

const notificationTimeBefore = (
  time: string | null,
  minutesBefore: number | null
): string | null => {
  if (minutesBefore === null) return null;
  if (!time)
    return invalid("notification", "A task time is required to set a reminder.");
  const [hour, minute] = time.split(":").map(Number);
  const absolute = (hour * 60 + minute - minutesBefore + 1440) % 1440;
  return `${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
};

const minuteDifference = (
  taskTime: string | null,
  notificationTime: string | null
): number | null => {
  if (!taskTime || !notificationTime) return null;
  const toMinutes = (value: string) =>
    Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
  return (toMinutes(taskTime) - toMinutes(notificationTime) + 1440) % 1440;
};

const baseWrite = (args: JsonObject, today: string) => {
  const title = args.title;
  if (typeof title !== "string" || !title.trim())
    invalid("title", "title is required.");
  if (
    Object.keys(args).some(
      (key) =>
        ![
          "title",
          "description",
          "date",
          "time",
          "recurrence",
          "notification"
        ].includes(key)
    )
  )
    invalid("arguments", "Unsupported create_task field.");
  const time = parseTime(args.time);
  const notification = parseNotification(args.notification);
  const description = args.description;
  if (
    description !== undefined &&
    description !== null &&
    typeof description !== "string"
  )
    invalid("description", "description must be a string or null.");

  // Keep the original date/time-only create_task contract working for existing Muse clients.
  if (args.recurrence === undefined) {
    const date = parseDate(args.date ?? today, "date");
    return validateTaskWriteInput({
      title,
      description,
      modelRecurrenceType: "once",
      executionTiming: "on_date",
      startDate: today,
      targetDate: date,
      scheduledTime: time,
      assignmentType: "anyone",
      notificationSlot: "none",
      notificationTime: null,
      weekdays: [],
      weeklyTargetCount: null,
      deadlineTime: null,
      notificationOffsetMinutes: null
    });
  }

  const recurrence = parseRecurrence(args.recurrence);
  if (hasOwn(args, "date") && recurrence.type !== "once")
    invalid(
      "date",
      "date is only used with once recurrence; deadline uses recurrence.date."
    );
  const common = { title, description, assignmentType: "anyone", assignedUserId: null };
  if (recurrence.type === "weekly_count") {
    const count = recurrence.count;
    if (typeof count !== "number" || !Number.isInteger(count) || count < 1 || count > 7)
      invalid("recurrence.count", "count must be an integer from 1 to 7.");
    return validateTaskWriteInput({
      ...common,
      recurrenceType: "weekly",
      scheduledTime: time,
      notificationSlot: "none",
      notificationTime: notificationTimeBefore(time, notification.minutesBefore),
      weekdays: [],
      weeklyTargetCount: count,
      startDate: today,
      targetDate: null,
      deadlineTime: null,
      notificationOffsetMinutes: null
    });
  }

  const typeMap = {
    once: "once",
    daily: "daily",
    weekly: "weekly_fixed",
    weekly_flexible: "weekly_flexible",
    monthly: "monthly_fixed",
    monthly_flexible: "monthly_flexible",
    this_week: "once",
    this_month: "once",
    deadline: "once"
  } as const;
  const modelRecurrenceType = typeMap[recurrence.type];
  const executionTiming =
    recurrence.type === "this_week" || recurrence.type === "weekly_flexible"
      ? "this_week"
      : recurrence.type === "this_month" || recurrence.type === "monthly_flexible"
        ? "this_month"
        : recurrence.type === "deadline"
          ? "by_deadline"
          : "on_date";
  const date =
    recurrence.type === "deadline"
      ? parseDate(recurrence.date, "recurrence.date")
      : recurrence.type === "once"
        ? parseDate(args.date ?? today, "date")
        : null;
  const weekdays =
    recurrence.type === "weekly" ? parseWeekdays(recurrence.weekdays) : [];
  const dayOfMonth = recurrence.type === "monthly" ? recurrence.dayOfMonth : null;
  const monthlyFlexible = recurrence.type === "monthly_flexible";
  const flexibleMonthDeadline = monthlyFlexible
    ? (recurrence.monthDeadline ?? "month_end")
    : null;
  return validateTaskWriteInput({
    ...common,
    modelRecurrenceType,
    executionTiming,
    scheduledTime: null,
    notificationSlot: "none",
    notificationTime: null,
    weekdays,
    weeklyTargetCount: null,
    startDate: today,
    targetDate:
      executionTiming === "on_date" && modelRecurrenceType === "once" ? date : null,
    deadlineDate: executionTiming === "by_deadline" ? date : null,
    deadlineTime: time,
    notificationOffsetMinutes: notification.minutesBefore,
    monthlyDayOfMonth:
      dayOfMonth ??
      (monthlyFlexible && flexibleMonthDeadline === "day_of_month"
        ? recurrence.dayOfMonth
        : null),
    monthlyDeadlineType: flexibleMonthDeadline,
    weeklyDeadlineWeekday:
      recurrence.type === "weekly_flexible" && recurrence.deadlineWeekday !== undefined
        ? weekdayIndex.get(recurrence.deadlineWeekday as (typeof MCP_WEEKDAYS)[number])
        : null
  });
};

export const createMuseTaskInput = (value: unknown, today: string): TaskWriteInput => {
  const args = object(value);
  if (!args) return invalid("arguments", "Task arguments must be an object.");
  return baseWrite(args, today);
};

export const updateMuseTaskInput = (
  value: unknown,
  current: Task,
  today: string
): TaskPatchInput => {
  const args = object(value);
  if (!args) return invalid("arguments", "Task arguments must be an object.");
  const allowed = [
    "taskId",
    "title",
    "description",
    "date",
    "time",
    "recurrence",
    "notification"
  ];
  if (Object.keys(args).some((key) => !allowed.includes(key)))
    invalid("arguments", "Unsupported update_task field.");
  if (typeof args.taskId !== "string" || !args.taskId.trim())
    invalid("taskId", "taskId is required.");
  if (Object.keys(args).length === 1)
    invalid("updates", "Provide at least one field to update.");

  const output: JsonObject = {};
  if (hasOwn(args, "title")) output.title = args.title;
  if (hasOwn(args, "description")) output.description = args.description;
  const time = hasOwn(args, "time") ? parseTime(args.time) : undefined;
  const notification = hasOwn(args, "notification")
    ? parseNotification(args.notification)
    : undefined;
  const recurrence = hasOwn(args, "recurrence")
    ? parseRecurrence(args.recurrence)
    : undefined;
  const isWeeklyCount =
    recurrence?.type === "weekly_count" ||
    (!recurrence &&
      !current.modelRecurrenceType &&
      current.recurrenceType === "weekly");

  if (recurrence) {
    if (recurrence.type === "weekly_count") {
      const count = recurrence.count;
      if (
        typeof count !== "number" ||
        !Number.isInteger(count) ||
        count < 1 ||
        count > 7
      )
        invalid("recurrence.count", "count must be an integer from 1 to 7.");
      Object.assign(output, {
        recurrenceType: "weekly",
        weeklyTargetCount: count,
        modelRecurrenceType: null,
        weekdays: [],
        weeklyDeadlineWeekday: null,
        monthlyDayOfMonth: null,
        monthlyDeadlineType: null,
        executionTiming: "on_date",
        deadlineDate: null,
        deadlineTime: null,
        notificationOffsetMinutes: null,
        scheduledTime: current.modelRecurrenceType
          ? (current.deadlineTime ?? current.scheduledTime)
          : current.scheduledTime
      });
      if (
        !notification &&
        current.modelRecurrenceType &&
        current.notificationOffsetMinutes != null
      )
        output.notificationTime = notificationTimeBefore(
          current.deadlineTime ?? current.scheduledTime ?? null,
          current.notificationOffsetMinutes
        );
    } else {
      const typeMap = {
        once: "once",
        daily: "daily",
        weekly: "weekly_fixed",
        weekly_flexible: "weekly_flexible",
        monthly: "monthly_fixed",
        monthly_flexible: "monthly_flexible",
        this_week: "once",
        this_month: "once",
        deadline: "once"
      } as const;
      const modelRecurrenceType = typeMap[recurrence.type];
      const executionTiming =
        recurrence.type === "this_week" || recurrence.type === "weekly_flexible"
          ? "this_week"
          : recurrence.type === "this_month" || recurrence.type === "monthly_flexible"
            ? "this_month"
            : recurrence.type === "deadline"
              ? "by_deadline"
              : "on_date";
      const deadlineDate =
        recurrence.type === "deadline"
          ? parseDate(recurrence.date, "recurrence.date")
          : null;
      Object.assign(output, {
        modelRecurrenceType,
        executionTiming,
        recurrenceType: modelRecurrenceType,
        ...(recurrence.type === "weekly"
          ? { weekdays: parseWeekdays(recurrence.weekdays) }
          : {}),
        ...(recurrence.type === "monthly"
          ? { monthlyDayOfMonth: recurrence.dayOfMonth }
          : {}),
        ...(recurrence.type === "weekly_flexible"
          ? {
              weeklyDeadlineWeekday:
                recurrence.deadlineWeekday === undefined
                  ? null
                  : weekdayIndex.get(
                      recurrence.deadlineWeekday as (typeof MCP_WEEKDAYS)[number]
                    )
            }
          : {}),
        ...(recurrence.type === "monthly_flexible"
          ? {
              monthlyDeadlineType: recurrence.monthDeadline ?? "month_end",
              monthlyDayOfMonth:
                recurrence.monthDeadline === "day_of_month"
                  ? recurrence.dayOfMonth
                  : null
            }
          : {}),
        ...(recurrence.type === "once"
          ? { targetDate: parseDate(args.date ?? current.targetDate ?? today, "date") }
          : {}),
        deadlineDate,
        ...(recurrence.type === "deadline" ? { targetDate: null } : {}),
        ...(recurrence.type === "this_week" || recurrence.type === "this_month"
          ? { startDate: today, targetDate: null }
          : {}),
        ...(recurrence.type !== "weekly" ? { weekdays: [] } : {}),
        ...(!["monthly", "monthly_flexible"].includes(recurrence.type)
          ? { monthlyDayOfMonth: null, monthlyDeadlineType: null }
          : {}),
        weeklyTargetCount: null,
        weeklyDeadlineWeekday: null,
        ...(modelRecurrenceType !== "once" ? { deadlineDate: null } : {})
      });
      if (
        !isWeeklyCount &&
        !current.modelRecurrenceType &&
        current.recurrenceType === "weekly"
      ) {
        output.scheduledTime = null;
        output.deadlineTime = current.scheduledTime;
        output.notificationOffsetMinutes = minuteDifference(
          current.scheduledTime,
          current.notificationTime
        );
      }
      if (recurrence.type === "once") output.startDate = current.startDate ?? today;
    }
  }

  if (hasOwn(args, "date")) {
    if (isWeeklyCount) invalid("date", "date does not apply to weekly_count tasks.");
    const date = parseDate(args.date, "date");
    if (recurrence?.type === "deadline") {
      output.deadlineDate = date;
    } else if (recurrence?.type === "once") {
      output.targetDate = date;
    } else if (recurrence) {
      invalid("date", "date can only be changed with once or deadline recurrence.");
    } else if (current.executionTiming === "by_deadline") {
      output.deadlineDate = date;
    } else if (
      current.modelRecurrenceType === "once" ||
      current.recurrenceType === "model_only"
    ) {
      output.executionTiming = "on_date";
      output.targetDate = date;
      output.deadlineDate = null;
    } else {
      invalid("date", "date can only be changed for a single-occurrence task.");
    }
  }

  if (time !== undefined) {
    if (isWeeklyCount) {
      output.scheduledTime = time;
      if (!notification && current.notificationTime) {
        const previousOffset = minuteDifference(
          current.scheduledTime,
          current.notificationTime
        );
        output.notificationTime = notificationTimeBefore(time, previousOffset);
      }
    } else {
      output.deadlineTime = time;
      if (time === null) output.notificationOffsetMinutes = null;
    }
  }

  if (notification) {
    if (isWeeklyCount) {
      const taskTime = time !== undefined ? time : current.scheduledTime;
      output.notificationTime = notificationTimeBefore(
        taskTime,
        notification.minutesBefore
      );
      output.notificationSlot = "none";
    } else {
      const taskTime = time !== undefined ? time : current.deadlineTime;
      if (notification.enabled && !taskTime)
        invalid("notification", "A task time is required to set a reminder.");
      output.notificationOffsetMinutes = notification.minutesBefore;
      if (time === undefined && notification.enabled)
        output.deadlineTime = current.deadlineTime;
    }
  }

  if (
    recurrence?.type === "weekly_count" &&
    !notification &&
    !hasOwn(args, "time") &&
    !current.notificationTime &&
    (current.notificationOffsetMinutes ?? null) !== null
  ) {
    output.notificationTime = notificationTimeBefore(
      current.scheduledTime ?? current.deadlineTime ?? null,
      current.notificationOffsetMinutes ?? null
    );
  }
  return validateTaskPatchInput(output);
};

const weekdayName = (day: number): string | null =>
  MCP_WEEKDAYS.find((_, index) => weekdayIndex.get(MCP_WEEKDAYS[index]) === day) ??
  null;

export const taskDetailsForMuse = (task: Task): JsonObject => {
  const legacyWeeklyCount =
    !task.modelRecurrenceType && task.recurrenceType === "weekly";
  let recurrence: JsonObject;
  if (legacyWeeklyCount)
    recurrence = { type: "weekly_count", count: task.weeklyTargetCount };
  else if (task.modelRecurrenceType === "once" && task.executionTiming === "this_week")
    recurrence = { type: "this_week" };
  else if (task.modelRecurrenceType === "once" && task.executionTiming === "this_month")
    recurrence = { type: "this_month" };
  else if (
    task.modelRecurrenceType === "once" &&
    task.executionTiming === "by_deadline"
  )
    recurrence = { type: "deadline", date: task.deadlineDate };
  else if (task.modelRecurrenceType === "weekly_fixed")
    recurrence = { type: "weekly", weekdays: task.weekdays.map(weekdayName) };
  else if (task.modelRecurrenceType === "weekly_flexible")
    recurrence = {
      type: "weekly_flexible",
      deadlineWeekday: weekdayName(task.weeklyDeadlineWeekday ?? 0)
    };
  else if (task.modelRecurrenceType === "monthly_fixed")
    recurrence = { type: "monthly", dayOfMonth: task.monthlyDayOfMonth };
  else if (task.modelRecurrenceType === "monthly_flexible")
    recurrence = {
      type: "monthly_flexible",
      monthDeadline: task.monthlyDeadlineType ?? "month_end",
      ...(task.monthlyDeadlineType === "day_of_month"
        ? { dayOfMonth: task.monthlyDayOfMonth }
        : {})
    };
  else {
    const type =
      task.modelRecurrenceType ??
      (task.recurrenceType === "scheduled"
        ? "weekly_fixed"
        : task.recurrenceType === "model_only"
          ? "once"
          : task.recurrenceType);
    recurrence = { type };
  }

  const taskTime = legacyWeeklyCount
    ? task.scheduledTime
    : (task.deadlineTime ?? task.scheduledTime);
  const minutesBefore = legacyWeeklyCount
    ? minuteDifference(task.scheduledTime, task.notificationTime)
    : (task.notificationOffsetMinutes ?? null);
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    date: task.targetDate ?? null,
    time: taskTime ?? null,
    recurrence,
    notification: { enabled: minutesBefore !== null, minutesBefore },
    deadline: { date: task.deadlineDate ?? null, time: task.deadlineTime ?? null },
    assignment: { type: task.assignmentType, userId: task.assignedUserId },
    active: task.active
  };
};

export const todayForMcpUser = async (
  db: D1Database,
  userId: string
): Promise<string> => {
  const household = await new HouseholdService(db).requireCurrentHousehold(userId);
  return getLocalDate(new Date(), household.timezone);
};
