import type { CalendarMarkersResponse, CalendarSelectedResponse } from "../api/tasks";

export const CALENDAR_SNAPSHOT_DB_NAME = "house-to-do-calendar-snapshots";
export const CALENDAR_RANGE_STORE_NAME = "calendar-ranges";
export const CALENDAR_DAY_STORE_NAME = "calendar-days";
export const CALENDAR_SNAPSHOT_DB_VERSION = 1;

export type CalendarRangeSnapshotRecord = {
  key: string;
  schemaVersion: number;
  userId: string;
  householdId: string;
  timezone: string;
  from: string;
  to: string;
  savedAt: number;
  writeSequence: number;
  data: CalendarMarkersResponse;
};

export type CalendarDaySnapshotRecord = {
  key: string;
  schemaVersion: number;
  userId: string;
  householdId: string;
  timezone: string;
  selectedDate: string;
  savedAt: number;
  writeSequence: number;
  data: CalendarSelectedResponse;
};

const getIndexedDb = () => {
  try {
    return typeof indexedDB === "undefined" ? null : indexedDB;
  } catch {
    return null;
  }
};

const openDatabase = (): Promise<IDBDatabase> => {
  const database = getIndexedDb();
  if (!database) return Promise.reject(new Error("IndexedDB is unavailable"));
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = database.open(CALENDAR_SNAPSHOT_DB_NAME, CALENDAR_SNAPSHOT_DB_VERSION);
    } catch (error) {
      reject(error instanceof Error ? error : new Error("IndexedDB open failed"));
      return;
    }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(CALENDAR_RANGE_STORE_NAME)) {
        request.result.createObjectStore(CALENDAR_RANGE_STORE_NAME, { keyPath: "key" });
      }
      if (!request.result.objectStoreNames.contains(CALENDAR_DAY_STORE_NAME)) {
        request.result.createObjectStore(CALENDAR_DAY_STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
    request.onblocked = () => reject(new Error("IndexedDB open blocked"));
  });
};

const closeAfter = (database: IDBDatabase, operation: Promise<void>) =>
  operation.finally(() => database.close()).then(() => undefined);

export const readCalendarRangeSnapshotRecord = async (key: string): Promise<CalendarRangeSnapshotRecord | null> => {
  const database = await openDatabase();
  return new Promise<CalendarRangeSnapshotRecord | null>((resolve, reject) => {
    const transaction = database.transaction(CALENDAR_RANGE_STORE_NAME, "readonly");
    const request = transaction.objectStore(CALENDAR_RANGE_STORE_NAME).get(key);
    request.onsuccess = () => resolve((request.result as CalendarRangeSnapshotRecord | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB read failed"));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB read transaction failed"));
  }).finally(() => database.close());
};

export const readCalendarDaySnapshotRecord = async (key: string): Promise<CalendarDaySnapshotRecord | null> => {
  const database = await openDatabase();
  return new Promise<CalendarDaySnapshotRecord | null>((resolve, reject) => {
    const transaction = database.transaction(CALENDAR_DAY_STORE_NAME, "readonly");
    const request = transaction.objectStore(CALENDAR_DAY_STORE_NAME).get(key);
    request.onsuccess = () => resolve((request.result as CalendarDaySnapshotRecord | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB read failed"));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB read transaction failed"));
  }).finally(() => database.close());
};

const writeRecord = async <T extends { key: string; savedAt: number; writeSequence: number }>(
  storeName: string,
  record: T,
  maxRecords: number,
  belongsToIdentity: (candidate: T) => boolean
) => {
  const database = await openDatabase();
  const operation = new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const existingRequest = store.get(record.key);
    existingRequest.onsuccess = () => {
      const existing = existingRequest.result as T | undefined;
      if (existing && (existing.savedAt > record.savedAt || (existing.savedAt === record.savedAt && existing.writeSequence > record.writeSequence))) return;
      store.put(record);
      const allRequest = store.getAll();
      allRequest.onsuccess = () => {
        const records = (allRequest.result as T[]).filter(belongsToIdentity).sort((a, b) => b.savedAt - a.savedAt || b.writeSequence - a.writeSequence);
        records.slice(maxRecords).forEach((oldest) => store.delete(oldest.key));
      };
      allRequest.onerror = () => transaction.abort();
    };
    existingRequest.onerror = () => transaction.abort();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB write failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB write aborted"));
  });
  return closeAfter(database, operation);
};

export const writeCalendarRangeSnapshotRecord = (record: CalendarRangeSnapshotRecord) =>
  writeRecord(CALENDAR_RANGE_STORE_NAME, record, 3, (candidate) =>
    candidate.userId === record.userId && candidate.householdId === record.householdId && candidate.timezone === record.timezone
  );

export const writeCalendarDaySnapshotRecord = (record: CalendarDaySnapshotRecord) =>
  writeRecord(CALENDAR_DAY_STORE_NAME, record, 31, (candidate) =>
    candidate.userId === record.userId && candidate.householdId === record.householdId && candidate.timezone === record.timezone
  );

export const clearCalendarSnapshotRecords = async (): Promise<void> => {
  const database = await openDatabase();
  const operation = new Promise<void>((resolve, reject) => {
    const transaction = database.transaction([CALENDAR_RANGE_STORE_NAME, CALENDAR_DAY_STORE_NAME], "readwrite");
    transaction.objectStore(CALENDAR_RANGE_STORE_NAME).clear();
    transaction.objectStore(CALENDAR_DAY_STORE_NAME).clear();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB clear failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB clear aborted"));
  });
  return closeAfter(database, operation);
};

export const deleteCalendarDateRecords = async (identity: { userId: string; householdId: string; timezone: string }, date: string): Promise<void> => {
  const database = await openDatabase();
  const operation = new Promise<void>((resolve, reject) => {
    const transaction = database.transaction([CALENDAR_RANGE_STORE_NAME, CALENDAR_DAY_STORE_NAME], "readwrite");
    const rangeStore = transaction.objectStore(CALENDAR_RANGE_STORE_NAME);
    const dayStore = transaction.objectStore(CALENDAR_DAY_STORE_NAME);
    const rangeRequest = rangeStore.getAll();
    const dayRequest = dayStore.getAll();
    rangeRequest.onsuccess = () => {
      (rangeRequest.result as CalendarRangeSnapshotRecord[])
        .filter((record) => record.userId === identity.userId && record.householdId === identity.householdId && record.timezone === identity.timezone && record.from <= date && record.to >= date)
        .forEach((record) => rangeStore.delete(record.key));
    };
    dayRequest.onsuccess = () => {
      (dayRequest.result as CalendarDaySnapshotRecord[])
        .filter((record) => record.userId === identity.userId && record.householdId === identity.householdId && record.timezone === identity.timezone && record.selectedDate === date)
        .forEach((record) => dayStore.delete(record.key));
    };
    rangeRequest.onerror = () => transaction.abort();
    dayRequest.onerror = () => transaction.abort();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB invalidation failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB invalidation aborted"));
  });
  return closeAfter(database, operation);
};
