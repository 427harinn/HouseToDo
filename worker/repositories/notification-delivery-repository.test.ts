import { describe, expect, it } from "vitest";
import { NOTIFICATION_CLAIM_LEASE_MS, NotificationDeliveryRepository } from "./notification-delivery-repository";
import { MemoryD1 } from "../test-utils/memory-d1";

const claim = (repo: NotificationDeliveryRepository, id: string, now: string) =>
  repo.claim({
    id,
    userId: "user-1",
    householdId: "house-1",
    notificationType: "task",
    targetKey: "task-1:2026-08-13:21:00",
    now
  });

describe("notification delivery claims", () => {
  it("claims a new row and rejects a sent duplicate", async () => {
    const db = new MemoryD1();
    const repo = new NotificationDeliveryRepository(db as unknown as D1Database);

    expect(await claim(repo, "delivery-1", "2026-08-13T12:00:00.000Z")).toBe(true);
    await repo.markSent("delivery-1", "2026-08-13T12:00:01.000Z");
    expect(await claim(repo, "delivery-2", "2026-08-13T12:20:00.000Z")).toBe(false);
    expect(db.notificationDeliveries.get("delivery-1")).toMatchObject({
      status: "sent",
      sent_at: "2026-08-13T12:00:01.000Z"
    });
  });

  it("rejects a fresh pending row and reclaims a stale pending row", async () => {
    const db = new MemoryD1();
    const repo = new NotificationDeliveryRepository(db as unknown as D1Database);
    const claimedAt = "2026-08-13T12:00:00.000Z";

    expect(await claim(repo, "delivery-1", claimedAt)).toBe(true);
    expect(await claim(repo, "delivery-2", "2026-08-13T12:05:00.000Z")).toBe(false);
    expect(
      await claim(repo, "delivery-3", new Date(Date.parse(claimedAt) + NOTIFICATION_CLAIM_LEASE_MS + 1).toISOString())
    ).toBe(true);
    expect(db.notificationDeliveries.get("delivery-3")).toMatchObject({
      id: "delivery-3",
      status: "pending",
      claimed_at: new Date(Date.parse(claimedAt) + NOTIFICATION_CLAIM_LEASE_MS + 1).toISOString(),
      sent_at: null
    });
    expect(db.notificationDeliveries.has("delivery-1")).toBe(false);
  });

  it("allows only one of two concurrent stale reclaims", async () => {
    const db = new MemoryD1();
    const repo = new NotificationDeliveryRepository(db as unknown as D1Database);
    const claimedAt = "2026-08-13T12:00:00.000Z";
    const reclaimAt = new Date(Date.parse(claimedAt) + NOTIFICATION_CLAIM_LEASE_MS + 1).toISOString();

    await claim(repo, "delivery-1", claimedAt);
    const results = await Promise.all([
      claim(repo, "delivery-2", reclaimAt),
      claim(repo, "delivery-3", reclaimAt)
    ]);

    expect(results.sort()).toEqual([false, true]);
    expect(Array.from(db.notificationDeliveries.values())).toHaveLength(1);
  });

  it("does not reclaim a stale sent row", async () => {
    const db = new MemoryD1();
    const repo = new NotificationDeliveryRepository(db as unknown as D1Database);

    await claim(repo, "delivery-1", "2026-08-13T12:00:00.000Z");
    await repo.markSent("delivery-1", "2026-08-13T12:00:01.000Z");
    expect(await claim(repo, "delivery-2", "2026-08-13T13:00:00.000Z")).toBe(false);
    expect(db.notificationDeliveries.get("delivery-1")?.id).toBe("delivery-1");
  });
});
