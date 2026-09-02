import type { ShoppingItem, ShoppingItemList } from "../api/shopping";
import {
  clearShoppingSnapshotRecords,
  readShoppingSnapshotRecord,
  writeShoppingSnapshotRecord,
  type ShoppingSnapshotRecord
} from "./shopping-snapshot-idb";

export type ShoppingSnapshotIdentity = { userId: string; householdId: string };
export const SHOPPING_SNAPSHOT_SCHEMA_VERSION = 1;
export const SHOPPING_SNAPSHOT_CACHE_LIMIT = 1;

// plannedPurchaseDate is an item field, not a timezone-derived list boundary.
// Keep the key user/household scoped only; Calendar owns timezone-sensitive views.
const memorySnapshots = new Map<string, ShoppingSnapshotRecord>();
let cacheEpoch = 0;
let writeSequence = 0;

export const shoppingSnapshotKey = ({ userId, householdId }: ShoppingSnapshotIdentity) =>
  `shopping-list:${userId}:${householdId}`;

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object";
const isString = (value: unknown): value is string => typeof value === "string";
const isNullableString = (value: unknown): value is string | null => value === null || isString(value);
const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const isShoppingItem = (value: unknown): value is ShoppingItem => {
  if (!isRecord(value) || !isString(value.id) || !isString(value.name) || !isNullableString(value.quantity) || !isNullableString(value.note) || !isNullableString(value.plannedPurchaseDate) || (value.status !== "pending" && value.status !== "purchased") || !isString(value.addedBy) || !isFiniteNumber(value.sortOrder) || !isString(value.createdAt) || !isString(value.updatedAt)) return false;
  if (value.purchasedBy !== null && (!isRecord(value.purchasedBy) || !isString(value.purchasedBy.userId) || !isNullableString(value.purchasedBy.displayName))) return false;
  if (!isNullableString(value.purchasedAt)) return false;
  if (value.image !== null && (!isRecord(value.image) || value.image.available !== true || !isFiniteNumber(value.image.width) || !isFiniteNumber(value.image.height) || !isFiniteNumber(value.image.size) || !isString(value.image.updatedAt))) return false;
  return true;
};

export const isShoppingItemList = (value: unknown): value is ShoppingItemList =>
  isRecord(value) && Array.isArray(value.pending) && value.pending.every(isShoppingItem) && Array.isArray(value.purchased) && value.purchased.every(isShoppingItem);

export const isValidShoppingSnapshotRecord = (
  value: unknown,
  identity?: ShoppingSnapshotIdentity
): value is ShoppingSnapshotRecord => {
  if (!isRecord(value) || value.schemaVersion !== SHOPPING_SNAPSHOT_SCHEMA_VERSION || !isString(value.key) || !isString(value.userId) || !isString(value.householdId) || !isFiniteNumber(value.savedAt) || !isShoppingItemList(value.data)) return false;
  if (value.key !== shoppingSnapshotKey(value as ShoppingSnapshotIdentity)) return false;
  if (value.data.pending.some((item) => item.status !== "pending") || value.data.purchased.some((item) => item.status !== "purchased")) return false;
  return !identity || (value.key === shoppingSnapshotKey(identity) && value.userId === identity.userId && value.householdId === identity.householdId);
};

const makeRecord = (identity: ShoppingSnapshotIdentity, data: ShoppingItemList): ShoppingSnapshotRecord => ({
  key: shoppingSnapshotKey(identity), schemaVersion: SHOPPING_SNAPSHOT_SCHEMA_VERSION, ...identity, savedAt: Date.now(), data
});

const cloneList = (data: ShoppingItemList): ShoppingItemList => ({ pending: [...data.pending], purchased: [...data.purchased] });

export const readMemoryShoppingSnapshot = (identity: ShoppingSnapshotIdentity): ShoppingItemList | null => {
  const record = memorySnapshots.get(shoppingSnapshotKey(identity));
  return record && isValidShoppingSnapshotRecord(record, identity) ? cloneList(record.data) : null;
};

export const writeMemoryShoppingSnapshot = (identity: ShoppingSnapshotIdentity, data: ShoppingItemList): boolean => {
  if (!isShoppingItemList(data) || data.pending.some((item) => item.status !== "pending") || data.purchased.some((item) => item.status !== "purchased")) return false;
  memorySnapshots.set(shoppingSnapshotKey(identity), makeRecord(identity, cloneList(data)));
  return true;
};

export const readPersistentShoppingSnapshot = async (identity: ShoppingSnapshotIdentity): Promise<ShoppingItemList | null> => {
  try {
    const record = await readShoppingSnapshotRecord(shoppingSnapshotKey(identity));
    return record && isValidShoppingSnapshotRecord(record, identity) ? cloneList(record.data) : null;
  } catch {
    return null;
  }
};

export const writeServerConfirmedShoppingSnapshot = async (
  identity: ShoppingSnapshotIdentity,
  data: ShoppingItemList,
  expectedEpoch = cacheEpoch
): Promise<boolean> => {
  if (!isShoppingItemList(data) || data.pending.some((item) => item.status !== "pending") || data.purchased.some((item) => item.status !== "purchased") || expectedEpoch !== cacheEpoch) return false;
  const record = makeRecord(identity, cloneList(data));
  const previous = memorySnapshots.get(record.key);
  if (previous && previous.savedAt > record.savedAt) return false;
  memorySnapshots.set(record.key, record);
  try {
    if (expectedEpoch === cacheEpoch) await writeShoppingSnapshotRecord(record);
  } catch {
    // IndexedDB is optional; the in-memory cache and network remain usable.
  }
  return true;
};

export const mergeServerConfirmedShoppingItem = async (identity: ShoppingSnapshotIdentity, item: ShoppingItem) => {
  const current = readMemoryShoppingSnapshot(identity);
  if (!current) return false;
  const next: ShoppingItemList = {
    pending: current.pending.filter((candidate) => candidate.id !== item.id),
    purchased: current.purchased.filter((candidate) => candidate.id !== item.id)
  };
  next[item.status].push(item);
  return writeServerConfirmedShoppingSnapshot(identity, next);
};

export const removeServerConfirmedShoppingItem = async (identity: ShoppingSnapshotIdentity, itemId: string) => {
  const current = readMemoryShoppingSnapshot(identity);
  if (!current) return false;
  return writeServerConfirmedShoppingSnapshot(identity, {
    pending: current.pending.filter((item) => item.id !== itemId),
    purchased: current.purchased.filter((item) => item.id !== itemId)
  });
};

export const clearShoppingSnapshots = async (): Promise<void> => {
  cacheEpoch += 1;
  memorySnapshots.clear();
  try {
    await clearShoppingSnapshotRecords();
  } catch {
    // Logout must not be blocked by an unavailable IndexedDB implementation.
  }
};

export const clearMemoryShoppingSnapshots = () => memorySnapshots.clear();
export const getShoppingSnapshotEpoch = () => cacheEpoch;
export const getShoppingSnapshotWriteSequence = () => ++writeSequence;
