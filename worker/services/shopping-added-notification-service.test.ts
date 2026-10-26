import { describe, expect, it } from "vitest";
import { MemoryD1 } from "../test-utils/memory-d1";
import { ShoppingService } from "./shopping-service";
import { ShoppingAddedNotificationService } from "./shopping-added-notification-service";

const addHousehold = (db: MemoryD1, householdId: string, userIds: string[]) => {
  db.households.set(householdId, {
    id: householdId,
    name: householdId,
    timezone: "Asia/Tokyo",
    week_starts_on: 1,
    created_by: userIds[0],
    created_at: "2026-01-01",
    updated_at: "2026-01-01"
  });
  for (const [index, userId] of userIds.entries()) {
    db.users.set(userId, {
      id: userId,
      email: `${userId}@example.com`,
      password_hash: "hash",
      display_name: userId.toUpperCase(),
      created_at: "2026-01-01",
      updated_at: "2026-01-01"
    });
    db.members.set(`${householdId}:${userId}`, {
      household_id: householdId,
      user_id: userId,
      role: index === 0 ? "owner" : "member",
      color: null,
      joined_at: "2026-01-01"
    });
  }
};

const template = {
  id: "template-1",
  household_id: "house-1",
  name: "牛乳",
  quantity: "2本",
  note: "低脂肪",
  active: 1,
  sort_order: 1,
  created_by: "user-a",
  created_at: "2026-01-01",
  updated_at: "2026-01-01"
};

describe("shopping added notifications", () => {
  it("sends new items to other members in the same household, never to the actor or another household", async () => {
    const db = new MemoryD1();
    addHousehold(db, "house-1", ["user-a", "user-b"]);
    addHousehold(db, "house-2", ["user-c"]);
    const sentTo: string[] = [];
    const notifications = new ShoppingAddedNotificationService(db as unknown as D1Database, {
      sendPayload: (userId, householdId, payload) => {
        sentTo.push(`${userId}:${householdId}`);
        expect(payload).toMatchObject({
          title: "買い物リストに追加されました",
          body: "USER-Aさんが「りんご」を追加しました",
          data: { kind: "shopping_added", url: "/shopping" }
        });
        return Promise.resolve({ sent: 1, failed: 0 });
      }
    });
    const service = new ShoppingService(
      db as unknown as D1Database,
      undefined,
      { APP_ENV: "test" },
      notifications
    );

    const item = await service.createItem("user-a", {
      name: "りんご",
      quantity: null,
      note: null,
      plannedPurchaseDate: null
    }, "USER-A");

    expect(sentTo).toEqual(["user-b:house-1"]);
    expect(Array.from(db.notificationDeliveries.values())).toMatchObject([
      {
        user_id: "user-b",
        household_id: "house-1",
        notification_type: "shopping_added",
        target_key: `shopping:${item.id}`,
        status: "sent"
      }
    ]);
  });

  it("notifies when an item is created from a template", async () => {
    const db = new MemoryD1();
    addHousehold(db, "house-1", ["user-a", "user-b"]);
    db.shoppingTemplates.set(template.id, template);
    const sentTo: string[] = [];
    const notifications = new ShoppingAddedNotificationService(db as unknown as D1Database, {
      sendPayload: (userId) => {
        sentTo.push(userId);
        return Promise.resolve({ sent: 1, failed: 0 });
      }
    });
    const service = new ShoppingService(
      db as unknown as D1Database,
      undefined,
      { APP_ENV: "test" },
      notifications
    );

    await service.addFromTemplate("user-a", "template-1", "USER-A");

    expect(sentTo).toEqual(["user-b"]);
    expect(db.shoppingItems.size).toBe(1);
  });

  it("keeps item creation successful when push fails", async () => {
    const db = new MemoryD1();
    addHousehold(db, "house-1", ["user-a", "user-b"]);
    let attempts = 0;
    const notifications = new ShoppingAddedNotificationService(db as unknown as D1Database, {
      sendPayload: () => {
        attempts += 1;
        return Promise.reject(new Error("push failed"));
      }
    });
    const service = new ShoppingService(
      db as unknown as D1Database,
      undefined,
      { APP_ENV: "test" },
      notifications
    );

    const item = await service.createItem("user-a", {
      name: "パン",
      quantity: null,
      note: null,
      plannedPurchaseDate: null
    }, "USER-A");
    expect(db.shoppingItems.has(item.id)).toBe(true);
    expect(attempts).toBe(1);
    expect(db.notificationDeliveries.size).toBe(0);
  });

  it("does not send the same item notification twice", async () => {
    const db = new MemoryD1();
    addHousehold(db, "house-1", ["user-a", "user-b"]);
    let attempts = 0;
    const notifications = new ShoppingAddedNotificationService(db as unknown as D1Database, {
      sendPayload: () => {
        attempts += 1;
        return Promise.resolve({ sent: 1, failed: 0 });
      }
    });
    const service = new ShoppingService(
      db as unknown as D1Database,
      undefined,
      { APP_ENV: "test" },
      notifications
    );
    const item = await service.createItem("user-a", {
      name: "卵",
      quantity: null,
      note: null,
      plannedPurchaseDate: null
    }, "USER-A");

    await notifications.notifyAdded(item, "user-a", "USER-A", { APP_ENV: "test" });

    expect(attempts).toBe(1);
    expect(Array.from(db.notificationDeliveries.values())[0]?.status).toBe("sent");
  });
});
