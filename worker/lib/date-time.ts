const dateKeyPattern = /^\d{4}-\d{2}-\d{2}$/;

const parseDateKeyParts = (dateKey: string): { year: number; month: number; day: number } | null => {
  if (!dateKeyPattern.test(dateKey)) return null;
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
};

export const isValidDateKey = (dateKey: string): boolean => parseDateKeyParts(dateKey) !== null;

export const formatDateKey = (date: Date): string => date.toISOString().slice(0, 10);

export const getLocalDate = (
  value: Date | string | number = new Date(),
  timezone = "Asia/Tokyo"
): string => {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day}`;
};

export const getLocalTime = (
  value: Date | string | number = new Date(),
  timezone = "Asia/Tokyo"
): string =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).format(value instanceof Date ? value : new Date(value));

export const getWeekday = (dateKey: string): number => {
  const parts = parseDateKeyParts(dateKey);
  if (!parts) throw new Error("Invalid date key");
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
};

export const addDateKey = (dateKey: string, days: number): string => {
  const parts = parseDateKeyParts(dateKey);
  if (!parts) throw new Error("Invalid date key");
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return formatDateKey(date);
};

export const getWeekStartDate = (dateKey: string, weekStartsOn: number): string => {
  if (!Number.isInteger(weekStartsOn) || weekStartsOn < 0 || weekStartsOn > 6) {
    throw new Error("Invalid week start");
  }
  const weekday = getWeekday(dateKey);
  const diff = (weekday - weekStartsOn + 7) % 7;
  return addDateKey(dateKey, -diff);
};

export const getWeekEndDate = (dateKey: string, weekStartsOn: number): string =>
  addDateKey(getWeekStartDate(dateKey, weekStartsOn), 6);

export const isTaskScheduledForDate = (weekdays: number[], dateKey: string): boolean =>
  weekdays.includes(getWeekday(dateKey));

const zonedParts = (date: Date, timezone: string) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second)
  };
};

const timezoneOffsetMilliseconds = (date: Date, timezone: string): number => {
  const parts = zonedParts(date, timezone);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) -
    Math.floor(date.getTime() / 1000) * 1000;
};

/** Resolve a household-local date/time without depending on the Worker runtime timezone. */
export const zonedDateTimeToDate = (dateKey: string, time: string, timezone: string): Date => {
  const date = parseDateKeyParts(dateKey);
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!date || !match) throw new Error("Invalid local date/time");
  const wallTime = Date.UTC(date.year, date.month - 1, date.day, Number(match[1]), Number(match[2]));
  let instant = wallTime;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    instant = wallTime - timezoneOffsetMilliseconds(new Date(instant), timezone);
  }
  return new Date(instant);
};
