import type { HomeToday } from "../api/home";
import {
  clearHomeSnapshotRecords,
  readHomeSnapshotRecord,
  writeHomeSnapshotRecord,
  type HomeSnapshotRecord
} from "./home-snapshot-idb";

export type HomeSnapshotIdentity = {
  userId: string;
  householdId: string;
  date: string;
};

export const HOME_SNAPSHOT_SCHEMA_VERSION = 1;

const memorySnapshots = new Map<string, HomeSnapshotRecord>();
let cacheEpoch = 0;

export const homeSnapshotKey = ({ userId, householdId, date }: HomeSnapshotIdentity) =>
  `home:${userId}:${householdId}:${date}`;

const isDateKey = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

export const isHomeToday = (value: unknown): value is HomeToday => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<HomeToday>;
  const shopping = candidate.shopping;
  return isDateKey(candidate.date) &&
    Array.isArray(candidate.homeTasks) &&
    Array.isArray(candidate.completedRecords) &&
    Array.isArray(candidate.passedRecords) &&
    Array.isArray(candidate.members) &&
    Boolean(shopping) &&
    typeof shopping?.pendingCount === "number" &&
    Number.isFinite(shopping.pendingCount);
};

export const isValidHomeSnapshotRecord = (
  value: unknown,
  identity?: HomeSnapshotIdentity
): value is HomeSnapshotRecord => {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<HomeSnapshotRecord>;
  if (
    record.schemaVersion !== HOME_SNAPSHOT_SCHEMA_VERSION ||
    typeof record.key !== "string" ||
    typeof record.userId !== "string" ||
    typeof record.householdId !== "string" ||
    !isDateKey(record.date) ||
    typeof record.savedAt !== "number" ||
    !Number.isFinite(record.savedAt) ||
    !isHomeToday(record.data)
  ) return false;
  if (record.key !== homeSnapshotKey(record as HomeSnapshotIdentity)) return false;
  if (record.data.date !== record.date) return false;
  return !identity || (
    record.userId === identity.userId &&
    record.householdId === identity.householdId &&
    record.date === identity.date &&
    record.key === homeSnapshotKey(identity)
  );
};

const makeRecord = (identity: HomeSnapshotIdentity, data: HomeToday): HomeSnapshotRecord => ({
  key: homeSnapshotKey(identity),
  schemaVersion: HOME_SNAPSHOT_SCHEMA_VERSION,
  userId: identity.userId,
  householdId: identity.householdId,
  date: identity.date,
  savedAt: Date.now(),
  data
});

export const readMemoryHomeSnapshot = (identity: HomeSnapshotIdentity): HomeToday | null => {
  const record = memorySnapshots.get(homeSnapshotKey(identity));
  return record && isValidHomeSnapshotRecord(record, identity) ? record.data : null;
};

export const writeMemoryHomeSnapshot = (identity: HomeSnapshotIdentity, data: HomeToday): boolean => {
  if (data.date !== identity.date || !isHomeToday(data)) return false;
  memorySnapshots.set(homeSnapshotKey(identity), makeRecord(identity, data));
  return true;
};

export const readPersistentHomeSnapshot = async (identity: HomeSnapshotIdentity): Promise<HomeToday | null> => {
  try {
    const record = await readHomeSnapshotRecord(homeSnapshotKey(identity));
    if (!record || !isValidHomeSnapshotRecord(record, identity)) return null;
    return record.data;
  } catch {
    return null;
  }
};

export const writeServerConfirmedHomeSnapshot = async (
  identity: HomeSnapshotIdentity,
  data: HomeToday
): Promise<boolean> => {
  if (data.date !== identity.date || !isHomeToday(data)) return false;
  const record = makeRecord(identity, data);
  const previous = memorySnapshots.get(record.key);
  if (previous && previous.savedAt > record.savedAt) return false;
  memorySnapshots.set(record.key, record);
  const writeEpoch = cacheEpoch;
  try {
    if (writeEpoch === cacheEpoch) await writeHomeSnapshotRecord(record);
  } catch {
    // Persistent cache failure is deliberately non-fatal; memory/network remain usable.
  }
  return true;
};

export const clearHomeSnapshots = async (): Promise<void> => {
  cacheEpoch += 1;
  memorySnapshots.clear();
  try {
    await clearHomeSnapshotRecords();
  } catch {
    // Logout must not be blocked by an unavailable IndexedDB implementation.
  }
};

export const clearMemoryHomeSnapshots = () => memorySnapshots.clear();

export const clearMemoryHomeSnapshot = (identity: HomeSnapshotIdentity) => {
  memorySnapshots.delete(homeSnapshotKey(identity));
};
