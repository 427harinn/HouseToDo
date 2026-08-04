import { describe, expect, it } from "vitest";
import { OrphanR2ObjectRepository } from "../repositories/orphan-r2-object-repository";
import { MemoryD1 } from "../test-utils/memory-d1";
import { MemoryR2 } from "../test-utils/memory-r2";
import { OrphanR2CleanupService } from "./orphan-r2-cleanup-service";

const enqueue = async (db: MemoryD1, key: string, nextAttemptAt: string, sourceType = "manual_reconciliation" as const) => new OrphanR2ObjectRepository(db as unknown as D1Database).enqueue({ id: `queue-${key}`, r2Key: key, sourceType, sourceId: "source-1", householdId: "household-1", reason: "test", firstFailedAt: "2026-01-01T00:00:00.000Z", nextAttemptAt, now: "2026-01-01T00:00:00.000Z" });

describe("OrphanR2CleanupService", () => {
  it("does not process before the 30-day due time and deletes a due object", async () => {
    const db = new MemoryD1(); const bucket = new MemoryR2();
    await bucket.put("orphan-1", new Uint8Array([1]));
    await enqueue(db, "orphan-1", "2026-02-01T00:00:00.000Z");
    const service = new OrphanR2CleanupService(db as unknown as D1Database, bucket as unknown as R2Bucket);
    await expect(service.run("2026-01-31T23:59:59.000Z")).resolves.toMatchObject({ scanned: 0 });
    await expect(service.run("2026-02-01T00:00:00.000Z")).resolves.toMatchObject({ scanned: 1, deleted: 1 });
    expect(bucket.objects.has("orphan-1")).toBe(false); expect(db.orphanR2Objects.size).toBe(0);
  });

  it("skips a referenced object and treats a missing object as success", async () => {
    const db = new MemoryD1(); const bucket = new MemoryR2();
    await enqueue(db, "referenced", "2026-02-01T00:00:00.000Z"); await enqueue(db, "missing", "2026-02-01T00:00:00.000Z");
    db.shoppingItemImages.set("image-1", { id: "image-1", shopping_item_id: "item-1", household_id: "household-1", r2_key: "referenced", content_type: "image/webp", size_bytes: 1, width: 1, height: 1, created_by: "user-1", created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" });
    const result = await new OrphanR2CleanupService(db as unknown as D1Database, bucket as unknown as R2Bucket).run("2026-02-01T00:00:00.000Z");
    expect(result).toMatchObject({ scanned: 2, skippedReferenced: 1, missingObjects: 1 }); expect(db.orphanR2Objects.size).toBe(0);
  });

  it("updates retry information and abandons after the fifth failure", async () => {
    const db = new MemoryD1(); const bucket = new MemoryR2(); await bucket.put("bad", new Uint8Array([1])); bucket.deleteFailures.set("bad", new Error("injected"));
    await enqueue(db, "bad", "2026-02-01T00:00:00.000Z"); const service = new OrphanR2CleanupService(db as unknown as D1Database, bucket as unknown as R2Bucket);
    const first = await service.run("2026-02-01T00:00:00.000Z"); expect(first).toMatchObject({ retried: 1, failed: 1 }); expect(db.orphanR2Objects.get("queue-bad")).toMatchObject({ attempt_count: 1, next_attempt_at: "2026-02-02T00:00:00.000Z", status: "retry" });
    const expectedNext = ["2026-02-04T00:00:02.000Z", "2026-02-08T00:00:03.000Z", "2026-02-15T00:00:04.000Z"];
    for (let attempt = 2; attempt <= 5; attempt++) { db.orphanR2Objects.get("queue-bad")!.next_attempt_at = `2026-02-01T00:00:0${attempt}.000Z`; await service.run(`2026-02-01T00:00:0${attempt}.000Z`); if (attempt < 5) expect(db.orphanR2Objects.get("queue-bad")?.next_attempt_at).toBe(expectedNext[attempt - 2]); }
    expect(db.orphanR2Objects.get("queue-bad")?.status).toBe("abandoned");
  });
});
