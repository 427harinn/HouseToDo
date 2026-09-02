import type { ShoppingItemList } from "../api/shopping";

export const SHOPPING_SNAPSHOT_DB_NAME = "house-to-do-shopping-snapshots";
export const SHOPPING_SNAPSHOT_STORE_NAME = "shopping-lists";
export const SHOPPING_SNAPSHOT_DB_VERSION = 1;

export type ShoppingSnapshotRecord = {
  key: string;
  schemaVersion: number;
  userId: string;
  householdId: string;
  savedAt: number;
  data: ShoppingItemList;
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
      request = database.open(SHOPPING_SNAPSHOT_DB_NAME, SHOPPING_SNAPSHOT_DB_VERSION);
    } catch (error) {
      reject(error instanceof Error ? error : new Error("IndexedDB open failed"));
      return;
    }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(SHOPPING_SNAPSHOT_STORE_NAME)) {
        request.result.createObjectStore(SHOPPING_SNAPSHOT_STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
    request.onblocked = () => reject(new Error("IndexedDB open blocked"));
  });
};

export const readShoppingSnapshotRecord = async (key: string): Promise<ShoppingSnapshotRecord | null> => {
  const database = await openDatabase();
  return new Promise<ShoppingSnapshotRecord | null>((resolve, reject) => {
    const transaction = database.transaction(SHOPPING_SNAPSHOT_STORE_NAME, "readonly");
    const request = transaction.objectStore(SHOPPING_SNAPSHOT_STORE_NAME).get(key);
    request.onsuccess = () => resolve((request.result as ShoppingSnapshotRecord | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB read failed"));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB read transaction failed"));
  }).finally(() => database.close());
};

export const writeShoppingSnapshotRecord = async (record: ShoppingSnapshotRecord): Promise<void> => {
  const database = await openDatabase();
  const operation = new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(SHOPPING_SNAPSHOT_STORE_NAME, "readwrite");
    const store = transaction.objectStore(SHOPPING_SNAPSHOT_STORE_NAME);
    const existingRequest = store.get(record.key);
    existingRequest.onsuccess = () => {
      const existing = existingRequest.result as ShoppingSnapshotRecord | undefined;
      if (!existing || existing.savedAt <= record.savedAt) {
        store.put(record);
        const allRequest = store.getAll();
        allRequest.onsuccess = () => {
          const sameIdentity = (allRequest.result as ShoppingSnapshotRecord[])
            .filter((candidate) => candidate.userId === record.userId && candidate.householdId === record.householdId)
            .sort((a, b) => b.savedAt - a.savedAt);
          sameIdentity.slice(1).forEach((oldest) => store.delete(oldest.key));
        };
        allRequest.onerror = () => transaction.abort();
      }
    };
    existingRequest.onerror = () => transaction.abort();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB write failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB write aborted"));
  });
  await operation.finally(() => database.close());
};

export const deleteShoppingSnapshotRecord = async (key: string): Promise<void> => {
  const database = await openDatabase();
  const operation = new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(SHOPPING_SNAPSHOT_STORE_NAME, "readwrite");
    transaction.objectStore(SHOPPING_SNAPSHOT_STORE_NAME).delete(key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB delete failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB delete aborted"));
  });
  await operation.finally(() => database.close());
};

export const clearShoppingSnapshotRecords = async (): Promise<void> => {
  const database = await openDatabase();
  const operation = new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(SHOPPING_SNAPSHOT_STORE_NAME, "readwrite");
    transaction.objectStore(SHOPPING_SNAPSHOT_STORE_NAME).clear();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB clear failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB clear aborted"));
  });
  await operation.finally(() => database.close());
};
