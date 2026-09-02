import type { CalendarDateMarker, CalendarMarkersResponse, CalendarSelectedResponse, CalendarShoppingItem, TodayTask } from "../api/tasks";
import {
  clearCalendarSnapshotRecords,
  deleteCalendarShoppingDateRecords,
  readCalendarDaySnapshotRecord,
  readCalendarRangeSnapshotRecord,
  writeCalendarDaySnapshotRecord,
  writeCalendarRangeSnapshotRecord,
  type CalendarDaySnapshotRecord,
  type CalendarRangeSnapshotRecord
} from "./calendar-snapshot-idb";

export const CALENDAR_CACHE_SCHEMA_VERSION = 1;
export const CALENDAR_RANGE_CACHE_LIMIT = 3;
export const CALENDAR_DAY_CACHE_LIMIT = 31;

export type CalendarRangeSnapshotIdentity = {
  userId: string;
  householdId: string;
  timezone: string;
  from: string;
  to: string;
};

export type CalendarDaySnapshotIdentity = {
  userId: string;
  householdId: string;
  timezone: string;
  selectedDate: string;
};
export type CalendarShoppingInvalidationIdentity = Pick<CalendarDaySnapshotIdentity, "userId" | "householdId" | "timezone">;

const memoryRanges = new Map<string, CalendarRangeSnapshotRecord>();
const memoryDays = new Map<string, CalendarDaySnapshotRecord>();
const latestRequestSequences = new Map<string, number>();
let cacheEpoch = 0;
let writeSequence = 0;

const isDateKey = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object";
const isString = (value: unknown): value is string => typeof value === "string";
const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

export const calendarRangeSnapshotKey = (identity: CalendarRangeSnapshotIdentity) =>
  `calendar-range:${identity.userId}:${identity.householdId}:${identity.timezone}:${identity.from}:${identity.to}`;

export const calendarDaySnapshotKey = (identity: CalendarDaySnapshotIdentity) =>
  `calendar-day:${identity.userId}:${identity.householdId}:${identity.timezone}:${identity.selectedDate}`;

const isCalendarDateMarker = (value: unknown): value is CalendarDateMarker => {
  if (!isRecord(value) || !isFiniteNumber(value.fixedCount) || !isFiniteNumber(value.fixedCompletedCount) || !isFiniteNumber(value.fixedSkippedCount) || !isFiniteNumber(value.shoppingCount) || !isFiniteNumber(value.purchasedShoppingCount) || !Array.isArray(value.tasks)) return false;
  return value.tasks.every((task) => isRecord(task) && isString(task.id) && isString(task.title) && typeof task.deadline === "boolean");
};

export const isCalendarMarkersResponse = (value: unknown): value is CalendarMarkersResponse => {
  if (!isRecord(value) || !isDateKey(value.from) || !isDateKey(value.to) || !isDateKey(value.today) || !isString(value.timezone) || !isRecord(value.dates)) return false;
  return Object.entries(value.dates).every(([date, marker]) => isDateKey(date) && isCalendarDateMarker(marker));
};

const isTodayTask = (value: unknown): value is TodayTask => isRecord(value) && isString(value.id) && isString(value.title);
const isCalendarCompletedRecord = (value: unknown) => isRecord(value) && isString(value.id) && isString(value.taskId) && isString(value.title) && value.status === "completed";
const isCalendarShoppingItem = (value: unknown): value is CalendarShoppingItem => isRecord(value) && isString(value.id) && isString(value.name) && (value.status === "pending" || value.status === "purchased");

export const isCalendarSelectedResponse = (value: unknown): value is CalendarSelectedResponse => {
  if (!isRecord(value) || !isDateKey(value.today) || !isString(value.timezone) || !isDateKey(value.selectedDate) || !isRecord(value.selected)) return false;
  const selected = value.selected;
  return Array.isArray(selected.fixed) && selected.fixed.every(isTodayTask) &&
    Array.isArray(selected.weeklyFlexible) && selected.weeklyFlexible.every(isTodayTask) &&
    Array.isArray(selected.monthlyFlexible) && selected.monthlyFlexible.every(isTodayTask) &&
    Array.isArray(selected.completed) && selected.completed.every(isCalendarCompletedRecord) &&
    Array.isArray(selected.shopping) && selected.shopping.every(isCalendarShoppingItem);
};

export const isValidCalendarRangeSnapshotRecord = (value: unknown, identity?: CalendarRangeSnapshotIdentity): value is CalendarRangeSnapshotRecord => {
  if (!isRecord(value) || value.schemaVersion !== CALENDAR_CACHE_SCHEMA_VERSION || !isString(value.key) || !isString(value.userId) || !isString(value.householdId) || !isString(value.timezone) || !isDateKey(value.from) || !isDateKey(value.to) || !isFiniteNumber(value.savedAt) || !isFiniteNumber(value.writeSequence) || !isCalendarMarkersResponse(value.data)) return false;
  if (value.key !== calendarRangeSnapshotKey(value as CalendarRangeSnapshotIdentity) || value.data.from !== value.from || value.data.to !== value.to || value.data.timezone !== value.timezone) return false;
  return !identity || (value.key === calendarRangeSnapshotKey(identity) && value.userId === identity.userId && value.householdId === identity.householdId && value.timezone === identity.timezone && value.from === identity.from && value.to === identity.to);
};

export const isValidCalendarDaySnapshotRecord = (value: unknown, identity?: CalendarDaySnapshotIdentity): value is CalendarDaySnapshotRecord => {
  if (!isRecord(value) || value.schemaVersion !== CALENDAR_CACHE_SCHEMA_VERSION || !isString(value.key) || !isString(value.userId) || !isString(value.householdId) || !isString(value.timezone) || !isDateKey(value.selectedDate) || !isFiniteNumber(value.savedAt) || !isFiniteNumber(value.writeSequence) || !isCalendarSelectedResponse(value.data)) return false;
  if (value.key !== calendarDaySnapshotKey(value as CalendarDaySnapshotIdentity) || value.data.selectedDate !== value.selectedDate || value.data.timezone !== value.timezone) return false;
  return !identity || (value.key === calendarDaySnapshotKey(identity) && value.userId === identity.userId && value.householdId === identity.householdId && value.timezone === identity.timezone && value.selectedDate === identity.selectedDate);
};

const makeRangeRecord = (identity: CalendarRangeSnapshotIdentity, data: CalendarMarkersResponse, sequence: number): CalendarRangeSnapshotRecord => ({
  key: calendarRangeSnapshotKey(identity), schemaVersion: CALENDAR_CACHE_SCHEMA_VERSION, ...identity, savedAt: Date.now(), writeSequence: sequence, data
});

const makeDayRecord = (identity: CalendarDaySnapshotIdentity, data: CalendarSelectedResponse, sequence: number): CalendarDaySnapshotRecord => ({
  key: calendarDaySnapshotKey(identity), schemaVersion: CALENDAR_CACHE_SCHEMA_VERSION, ...identity, savedAt: Date.now(), writeSequence: sequence, data
});

const evictMemory = <T extends { userId: string; householdId: string; timezone: string; savedAt: number; writeSequence: number; key: string }>(cache: Map<string, T>, identity: { userId: string; householdId: string; timezone: string }, limit: number) => {
  const records = [...cache.values()].filter((record) => record.userId === identity.userId && record.householdId === identity.householdId && record.timezone === identity.timezone).sort((a, b) => b.savedAt - a.savedAt || b.writeSequence - a.writeSequence);
  records.slice(limit).forEach((record) => cache.delete(record.key));
};

export const readMemoryCalendarRangeSnapshot = (identity: CalendarRangeSnapshotIdentity): CalendarMarkersResponse | null => {
  const record = memoryRanges.get(calendarRangeSnapshotKey(identity));
  return record && isValidCalendarRangeSnapshotRecord(record, identity) ? record.data : null;
};

export const readMemoryCalendarDaySnapshot = (identity: CalendarDaySnapshotIdentity): CalendarSelectedResponse | null => {
  const record = memoryDays.get(calendarDaySnapshotKey(identity));
  return record && isValidCalendarDaySnapshotRecord(record, identity) ? record.data : null;
};

export const readPersistentCalendarRangeSnapshot = async (identity: CalendarRangeSnapshotIdentity): Promise<CalendarMarkersResponse | null> => {
  try {
    const record = await readCalendarRangeSnapshotRecord(calendarRangeSnapshotKey(identity));
    return record && isValidCalendarRangeSnapshotRecord(record, identity) ? record.data : null;
  } catch {
    return null;
  }
};

export const readPersistentCalendarDaySnapshot = async (identity: CalendarDaySnapshotIdentity): Promise<CalendarSelectedResponse | null> => {
  try {
    const record = await readCalendarDaySnapshotRecord(calendarDaySnapshotKey(identity));
    return record && isValidCalendarDaySnapshotRecord(record, identity) ? record.data : null;
  } catch {
    return null;
  }
};

export const getCalendarSnapshotEpoch = () => cacheEpoch;

export const writeServerConfirmedCalendarRangeSnapshot = async (identity: CalendarRangeSnapshotIdentity, data: CalendarMarkersResponse, requestSequence = 0, expectedEpoch = cacheEpoch): Promise<boolean> => {
  const key = calendarRangeSnapshotKey(identity);
  const previousRequestSequence = latestRequestSequences.get(key);
  if (expectedEpoch !== cacheEpoch || (requestSequence > 0 && previousRequestSequence !== undefined && requestSequence < previousRequestSequence) || !isValidCalendarRangeSnapshotRecord(makeRangeRecord(identity, data, requestSequence), identity)) return false;
  if (requestSequence > 0) latestRequestSequences.set(key, Math.max(requestSequence, previousRequestSequence ?? 0));
  const sequence = ++writeSequence;
  const record = makeRangeRecord(identity, data, Math.max(requestSequence, sequence));
  const previous = memoryRanges.get(record.key);
  if (previous && (previous.savedAt > record.savedAt || (previous.savedAt === record.savedAt && previous.writeSequence > record.writeSequence))) return false;
  memoryRanges.set(record.key, record);
  evictMemory(memoryRanges, identity, CALENDAR_RANGE_CACHE_LIMIT);
  try {
    if (expectedEpoch === cacheEpoch) await writeCalendarRangeSnapshotRecord(record);
  } catch {
    // IndexedDB is an optional acceleration layer.
  }
  return true;
};

export const writeServerConfirmedCalendarDaySnapshot = async (identity: CalendarDaySnapshotIdentity, data: CalendarSelectedResponse, requestSequence = 0, expectedEpoch = cacheEpoch): Promise<boolean> => {
  const key = calendarDaySnapshotKey(identity);
  const previousRequestSequence = latestRequestSequences.get(key);
  if (expectedEpoch !== cacheEpoch || (requestSequence > 0 && previousRequestSequence !== undefined && requestSequence < previousRequestSequence) || !isValidCalendarDaySnapshotRecord(makeDayRecord(identity, data, requestSequence), identity)) return false;
  if (requestSequence > 0) latestRequestSequences.set(key, Math.max(requestSequence, previousRequestSequence ?? 0));
  const sequence = ++writeSequence;
  const record = makeDayRecord(identity, data, Math.max(requestSequence, sequence));
  const previous = memoryDays.get(record.key);
  if (previous && (previous.savedAt > record.savedAt || (previous.savedAt === record.savedAt && previous.writeSequence > record.writeSequence))) return false;
  memoryDays.set(record.key, record);
  evictMemory(memoryDays, identity, CALENDAR_DAY_CACHE_LIMIT);
  try {
    if (expectedEpoch === cacheEpoch) await writeCalendarDaySnapshotRecord(record);
  } catch {
    // IndexedDB is an optional acceleration layer.
  }
  return true;
};

export const clearMemoryCalendarSnapshots = () => {
  cacheEpoch += 1;
  memoryRanges.clear();
  memoryDays.clear();
  latestRequestSequences.clear();
};

export const clearCalendarSnapshots = async (): Promise<void> => {
  clearMemoryCalendarSnapshots();
  try {
    await clearCalendarSnapshotRecords();
  } catch {
    // Logout must not be blocked by an unavailable IndexedDB implementation.
  }
};

/** Invalidate only Calendar marker/day snapshots whose Shopping projection includes date. */
export const invalidateCalendarShoppingDate = async (identity: CalendarShoppingInvalidationIdentity, date: string | null | undefined): Promise<void> => {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  cacheEpoch += 1;
  for (const [key, record] of memoryRanges) {
    if (record.userId === identity.userId && record.householdId === identity.householdId && record.timezone === identity.timezone && record.from <= date && record.to >= date) memoryRanges.delete(key);
  }
  for (const [key, record] of memoryDays) {
    if (record.userId === identity.userId && record.householdId === identity.householdId && record.timezone === identity.timezone && record.selectedDate === date) memoryDays.delete(key);
  }
  latestRequestSequences.clear();
  try {
    await deleteCalendarShoppingDateRecords(identity, date);
  } catch {
    // IndexedDB invalidation is best effort; the incremented epoch protects in-flight writes.
  }
};
