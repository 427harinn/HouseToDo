import { afterEach, describe, expect, it, vi } from "vitest";
import type { ShoppingItem, ShoppingItemList } from "../api/shopping";
import {
  SHOPPING_SNAPSHOT_SCHEMA_VERSION,
  clearShoppingSnapshots,
  isShoppingItemList,
  isValidShoppingSnapshotRecord,
  readMemoryShoppingSnapshot,
  readPersistentShoppingSnapshot,
  shoppingSnapshotKey,
  writeMemoryShoppingSnapshot,
  writeServerConfirmedShoppingSnapshot
} from "./shopping-snapshot";

const identity = { userId: "user-a", householdId: "house-a" };
const item = (id: string, status: ShoppingItem["status"]): ShoppingItem => ({
  id, name: id, quantity: null, note: null, plannedPurchaseDate: null, status,
  addedBy: "user-a", purchasedBy: status === "purchased" ? { userId: "user-a", displayName: "A" } : null,
  purchasedAt: status === "purchased" ? "2026-09-01T00:00:00.000Z" : null,
  sortOrder: 1, createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", image: null
});
const data: ShoppingItemList = { pending: [item("milk", "pending")], purchased: [item("bread", "purchased")] };

afterEach(async () => {
  vi.restoreAllMocks();
  await clearShoppingSnapshots();
});

describe("Shopping snapshot identity and validation", () => {
  it("keys by user and household without timezone", () => {
    expect(shoppingSnapshotKey(identity)).toBe("shopping-list:user-a:house-a");
  });

  it("accepts a server-shaped empty list and rejects malformed or cross-identity records", () => {
    expect(isShoppingItemList({ pending: [], purchased: [] })).toBe(true);
    const record = { key: shoppingSnapshotKey(identity), schemaVersion: SHOPPING_SNAPSHOT_SCHEMA_VERSION, ...identity, savedAt: Date.now(), data };
    expect(isValidShoppingSnapshotRecord(record, identity)).toBe(true);
    expect(isValidShoppingSnapshotRecord({ ...record, data: { pending: [{}], purchased: [] } }, identity)).toBe(false);
    expect(isValidShoppingSnapshotRecord({ ...record, schemaVersion: 0 }, identity)).toBe(false);
    expect(isValidShoppingSnapshotRecord(record, { ...identity, householdId: "house-b" })).toBe(false);
  });
});

describe("server-confirmed Shopping snapshots", () => {
  it("reads and writes the isolated memory snapshot", async () => {
    expect(writeMemoryShoppingSnapshot(identity, data)).toBe(true);
    expect(readMemoryShoppingSnapshot(identity)).toEqual(data);
    expect(readMemoryShoppingSnapshot({ userId: "user-b", householdId: identity.householdId })).toBeNull();
    await expect(writeServerConfirmedShoppingSnapshot(identity, { pending: [], purchased: [] })).resolves.toBe(true);
    expect(readMemoryShoppingSnapshot(identity)).toEqual({ pending: [], purchased: [] });
  });

  it("falls back safely when IndexedDB is unavailable", async () => {
    await expect(readPersistentShoppingSnapshot(identity)).resolves.toBeNull();
    await expect(writeServerConfirmedShoppingSnapshot(identity, data)).resolves.toBe(true);
    expect(readMemoryShoppingSnapshot(identity)).toEqual(data);
  });

  it("clears memory on logout", async () => {
    writeMemoryShoppingSnapshot(identity, data);
    await clearShoppingSnapshots();
    expect(readMemoryShoppingSnapshot(identity)).toBeNull();
  });
});
