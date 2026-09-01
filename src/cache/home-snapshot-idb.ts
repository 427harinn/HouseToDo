import type { HomeToday } from "../api/home";

export const HOME_SNAPSHOT_DB_NAME = "house-to-do-home-snapshots";
export const HOME_SNAPSHOT_STORE_NAME = "home-snapshots";
export const HOME_SNAPSHOT_DB_VERSION = 1;

export type HomeSnapshotRecord = {
  key: string;
  schemaVersion: number;
  userId: string;
  householdId: string;
  date: string;
  savedAt: number;
  data: HomeToday;
};

const getIndexedDb = () => {
  if (typeof indexedDB === "undefined") return null;
  return indexedDB;
};

const openDatabase = (): Promise<IDBDatabase> => {
  const database = getIndexedDb();
  if (!database) return Promise.reject(new Error("IndexedDB is unavailable"));
  return new Promise((resolve, reject) => {
    const request = database.open(HOME_SNAPSHOT_DB_NAME, HOME_SNAPSHOT_DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(HOME_SNAPSHOT_STORE_NAME)) {
        request.result.createObjectStore(HOME_SNAPSHOT_STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
    request.onblocked = () => reject(new Error("IndexedDB open blocked"));
  });
};

const closeAfter = (database: IDBDatabase, promise: Promise<void>) =>
  promise.finally(() => database.close()).then(() => undefined);

export const readHomeSnapshotRecord = async (key: string): Promise<HomeSnapshotRecord | null> => {
  const database = await openDatabase();
  return new Promise<HomeSnapshotRecord | null>((resolve, reject) => {
    const transaction = database.transaction(HOME_SNAPSHOT_STORE_NAME, "readonly");
    const request = transaction.objectStore(HOME_SNAPSHOT_STORE_NAME).get(key);
    request.onsuccess = () => resolve((request.result as HomeSnapshotRecord | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB read failed"));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB read transaction failed"));
  }).finally(() => database.close());
};

export const writeHomeSnapshotRecord = async (record: HomeSnapshotRecord): Promise<void> => {
  const database = await openDatabase();
  const operation = new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(HOME_SNAPSHOT_STORE_NAME, "readwrite");
    const store = transaction.objectStore(HOME_SNAPSHOT_STORE_NAME);
    const existingRequest = store.get(record.key);
    existingRequest.onsuccess = () => {
      const existing = existingRequest.result as HomeSnapshotRecord | undefined;
      if (!existing || existing.savedAt <= record.savedAt) store.put(record);
    };
    existingRequest.onerror = () => transaction.abort();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB write failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB write aborted"));
  });
  return closeAfter(database, operation);
};

export const deleteHomeSnapshotRecord = async (key: string): Promise<void> => {
  const database = await openDatabase();
  const operation = new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(HOME_SNAPSHOT_STORE_NAME, "readwrite");
    transaction.objectStore(HOME_SNAPSHOT_STORE_NAME).delete(key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB delete failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB delete aborted"));
  });
  return closeAfter(database, operation);
};

export const clearHomeSnapshotRecords = async (): Promise<void> => {
  const database = await openDatabase();
  const operation = new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(HOME_SNAPSHOT_STORE_NAME, "readwrite");
    transaction.objectStore(HOME_SNAPSHOT_STORE_NAME).clear();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB clear failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB clear aborted"));
  });
  return closeAfter(database, operation);
};
