import { afterEach, describe, expect, it, vi } from "vitest";
import type { CalendarMarkersResponse, CalendarSelectedResponse } from "../api/tasks";
import {
  CALENDAR_CACHE_SCHEMA_VERSION,
  CALENDAR_DAY_CACHE_LIMIT,
  CALENDAR_RANGE_CACHE_LIMIT,
  calendarDaySnapshotKey,
  calendarRangeSnapshotKey,
  clearCalendarSnapshots,
  clearMemoryCalendarSnapshots,
  isCalendarSelectedResponse,
  isValidCalendarDaySnapshotRecord,
  isValidCalendarRangeSnapshotRecord,
  readMemoryCalendarDaySnapshot,
  readMemoryCalendarRangeSnapshot,
  readPersistentCalendarDaySnapshot,
  writeServerConfirmedCalendarDaySnapshot,
  writeServerConfirmedCalendarRangeSnapshot
} from "./calendar-snapshot";

const rangeIdentity = { userId: "user-a", householdId: "house-a", timezone: "Asia/Tokyo", from: "2026-08-30", to: "2026-10-10" };
const dayIdentity = { userId: "user-a", householdId: "house-a", timezone: "Asia/Tokyo", selectedDate: "2026-09-01" };
const rangeData = (from = rangeIdentity.from, to = rangeIdentity.to): CalendarMarkersResponse => ({
  from, to, today: "2026-09-01", timezone: rangeIdentity.timezone, dates: {}
});
const dayData = (selectedDate = dayIdentity.selectedDate): CalendarSelectedResponse => ({
  today: "2026-09-01", timezone: dayIdentity.timezone, selectedDate,
  selected: { fixed: [], weeklyFlexible: [], monthlyFlexible: [], completed: [], shopping: [] }
});

afterEach(async () => {
  vi.restoreAllMocks();
  clearMemoryCalendarSnapshots();
  await clearCalendarSnapshots();
});

describe("Calendar snapshot keys and validation", () => {
  it("includes identity, timezone, and the exact range or date", () => {
    expect(calendarRangeSnapshotKey(rangeIdentity)).toBe("calendar-range:user-a:house-a:Asia/Tokyo:2026-08-30:2026-10-10");
    expect(calendarDaySnapshotKey(dayIdentity)).toBe("calendar-day:user-a:house-a:Asia/Tokyo:2026-09-01");
  });

  it("rejects a wrong household, timezone, range, date, or schema", () => {
    const rangeRecord = { key: calendarRangeSnapshotKey(rangeIdentity), schemaVersion: CALENDAR_CACHE_SCHEMA_VERSION, ...rangeIdentity, savedAt: Date.now(), writeSequence: 1, data: rangeData() };
    const dayRecord = { key: calendarDaySnapshotKey(dayIdentity), schemaVersion: CALENDAR_CACHE_SCHEMA_VERSION, ...dayIdentity, savedAt: Date.now(), writeSequence: 1, data: dayData() };
    expect(isValidCalendarRangeSnapshotRecord(rangeRecord, rangeIdentity)).toBe(true);
    expect(isValidCalendarRangeSnapshotRecord(rangeRecord, { ...rangeIdentity, householdId: "house-b" })).toBe(false);
    expect(isValidCalendarRangeSnapshotRecord(rangeRecord, { ...rangeIdentity, timezone: "UTC" })).toBe(false);
    expect(isValidCalendarRangeSnapshotRecord(rangeRecord, { ...rangeIdentity, from: "2026-09-01" })).toBe(false);
    expect(isValidCalendarRangeSnapshotRecord({ ...rangeRecord, schemaVersion: 0 }, rangeIdentity)).toBe(false);
    expect(isValidCalendarDaySnapshotRecord(dayRecord, { ...dayIdentity, selectedDate: "2026-09-02" })).toBe(false);
    expect(isValidCalendarDaySnapshotRecord(dayRecord, { ...dayIdentity, userId: "user-b" })).toBe(false);
  });

  it("accepts a server-confirmed empty day but not malformed selected data", () => {
    expect(isCalendarSelectedResponse(dayData())).toBe(true);
    expect(isCalendarSelectedResponse({ ...dayData(), selected: { fixed: null } })).toBe(false);
    expect(isCalendarSelectedResponse({ ...dayData(), selectedDate: "2026-09-02" })).toBe(true);
  });
});

describe("server-confirmed Calendar snapshots", () => {
  it("keeps range and day caches isolated by identity", async () => {
    await writeServerConfirmedCalendarRangeSnapshot(rangeIdentity, rangeData(), 1);
    await writeServerConfirmedCalendarDaySnapshot(dayIdentity, dayData(), 1);
    expect(readMemoryCalendarRangeSnapshot(rangeIdentity)).toEqual(rangeData());
    expect(readMemoryCalendarRangeSnapshot({ ...rangeIdentity, householdId: "house-b" })).toBeNull();
    expect(readMemoryCalendarRangeSnapshot({ ...rangeIdentity, timezone: "UTC" })).toBeNull();
    expect(readMemoryCalendarDaySnapshot(dayIdentity)).toEqual(dayData());
    expect(readMemoryCalendarDaySnapshot({ ...dayIdentity, selectedDate: "2026-09-02" })).toBeNull();
  });

  it("bounds memory retention to the documented limits", async () => {
    for (let index = 0; index < CALENDAR_RANGE_CACHE_LIMIT + 1; index += 1) {
      const from = `2026-0${index + 1}-01`;
      await writeServerConfirmedCalendarRangeSnapshot({ ...rangeIdentity, from, to: `2026-0${index + 1}-28` }, rangeData(from, `2026-0${index + 1}-28`), index + 1);
    }
    expect(readMemoryCalendarRangeSnapshot({ ...rangeIdentity, from: "2026-01-01", to: "2026-01-28" })).toBeNull();
    expect(readMemoryCalendarRangeSnapshot({ ...rangeIdentity, from: "2026-02-01", to: "2026-02-28" })).not.toBeNull();
    expect(CALENDAR_DAY_CACHE_LIMIT).toBe(31);
  });

  it("treats IndexedDB unavailability as a non-fatal network fallback", async () => {
    await expect(readPersistentCalendarDaySnapshot(dayIdentity)).resolves.toBeNull();
    await expect(writeServerConfirmedCalendarDaySnapshot(dayIdentity, dayData(), 1)).resolves.toBe(true);
    expect(readMemoryCalendarDaySnapshot(dayIdentity)).toEqual(dayData());
  });

  it("clears all in-memory identity data on lifecycle reset", async () => {
    await writeServerConfirmedCalendarRangeSnapshot(rangeIdentity, rangeData(), 1);
    await writeServerConfirmedCalendarDaySnapshot(dayIdentity, dayData(), 1);
    await clearCalendarSnapshots();
    expect(readMemoryCalendarRangeSnapshot(rangeIdentity)).toBeNull();
    expect(readMemoryCalendarDaySnapshot(dayIdentity)).toBeNull();
  });
});
