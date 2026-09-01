import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearHomeSnapshots,
  clearMemoryHomeSnapshots,
  homeSnapshotKey,
  isValidHomeSnapshotRecord,
  readMemoryHomeSnapshot,
  readPersistentHomeSnapshot,
  writeMemoryHomeSnapshot,
  writeServerConfirmedHomeSnapshot
} from "./home-snapshot";
import type { HomeToday } from "../api/home";

const identity = { userId: "user-a", householdId: "house-a", date: "2026-09-01" };
const data: HomeToday = {
  date: identity.date,
  homeTasks: [],
  completedRecords: [],
  passedRecords: [],
  shopping: { pendingCount: 2 },
  members: []
};

afterEach(async () => {
  vi.restoreAllMocks();
  clearMemoryHomeSnapshots();
  await clearHomeSnapshots();
});

describe("Home snapshot identity and validation", () => {
  it("builds a user, household, and local-date key", () => {
    expect(homeSnapshotKey(identity)).toBe("home:user-a:house-a:2026-09-01");
  });

  it("accepts only the same date, user, and household", () => {
    const record = {
      key: homeSnapshotKey(identity),
      schemaVersion: 1,
      ...identity,
      savedAt: Date.now(),
      data
    };
    expect(isValidHomeSnapshotRecord(record, identity)).toBe(true);
    expect(isValidHomeSnapshotRecord(record, { ...identity, date: "2026-08-31" })).toBe(false);
    expect(isValidHomeSnapshotRecord(record, { ...identity, userId: "user-b" })).toBe(false);
    expect(isValidHomeSnapshotRecord(record, { ...identity, householdId: "house-b" })).toBe(false);
    expect(isValidHomeSnapshotRecord({ ...record, schemaVersion: 0 }, identity)).toBe(false);
  });

  it("ignores malformed persistent records and treats IndexedDB failure as non-fatal", async () => {
    expect(isValidHomeSnapshotRecord({ key: "bad" }, identity)).toBe(false);
    await expect(readPersistentHomeSnapshot(identity)).resolves.toBeNull();
  });
});

describe("server-confirmed Home memory snapshot", () => {
  it("reads and writes only server-confirmed same-day data", async () => {
    expect(writeMemoryHomeSnapshot(identity, data)).toBe(true);
    expect(readMemoryHomeSnapshot(identity)).toEqual(data);
    expect(writeMemoryHomeSnapshot({ ...identity, date: "2026-08-31" }, data)).toBe(false);
    await expect(writeServerConfirmedHomeSnapshot(identity, data)).resolves.toBe(true);
  });

  it("clears on logout", async () => {
    writeMemoryHomeSnapshot(identity, data);
    expect(readMemoryHomeSnapshot(identity)).toEqual(data);
    await clearHomeSnapshots();
    expect(readMemoryHomeSnapshot(identity)).toBeNull();
  });
});
