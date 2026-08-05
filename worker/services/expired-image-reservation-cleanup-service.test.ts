import { describe, expect, it } from "vitest";
import { ImageUploadReservationRepository, type ImageUploadReservation } from "../repositories/image-upload-reservation-repository";
import { OrphanR2ObjectRepository } from "../repositories/orphan-r2-object-repository";
import { HouseholdImageUsageRepository } from "../repositories/household-image-usage-repository";
import { MemoryD1 } from "../test-utils/memory-d1";
import { MemoryR2 } from "../test-utils/memory-r2";
import { ExpiredImageReservationCleanupService } from "./expired-image-reservation-cleanup-service";

const reservation = (id: string, status: ImageUploadReservation["status"] = "reserved"): ImageUploadReservation => ({
  id, householdId: "house-1", shoppingItemId: id, operation: "create", status, r2Key: `key-${id}`, byteSize: 10,
  oldImageId: null, oldR2Key: null, oldSizeBytes: null, expiresAt: "2026-08-05T00:00:00.000Z", createdAt: "2026-08-04T00:00:00.000Z", updatedAt: "2026-08-04T00:00:00.000Z"
});

describe("ExpiredImageReservationCleanupService", () => {
  it("cleans expired reserved and r2_written reservations and releases usage", async () => {
    const db = new MemoryD1(); const bucket = new MemoryR2();
    await new HouseholdImageUsageRepository(db as unknown as D1Database).ensureUsageRow("house-1", "2026-08-05T00:00:00.000Z");
    const repo = new ImageUploadReservationRepository(db as unknown as D1Database);
    await repo.createReservation(reservation("reserved-1"));
    await repo.createReservation({ ...reservation("written-1", "r2_written"), r2Key: "written-key" });
    await bucket.put("written-key", new Uint8Array([1]));
    db.householdImageUsage.set("house-1", { ...db.householdImageUsage.get("house-1")!, reserved_count: 2, reserved_bytes: 20 });
    const result = await new ExpiredImageReservationCleanupService(db as unknown as D1Database, bucket as unknown as R2Bucket).run("2026-08-05T01:00:00.000Z");
    expect(result).toMatchObject({ scanned: 2, released: 2, r2Deleted: 2, failed: 0 });
    expect(db.imageUploadReservations.size).toBe(0); expect(db.householdImageUsage.get("house-1")).toMatchObject({ reserved_count: 0, reserved_bytes: 0 }); expect(bucket.objects.size).toBe(0);
  });

  it("queues failed R2 deletion with byte size and moves capacity to pending", async () => {
    const db = new MemoryD1(); const bucket = new MemoryR2();
    await new HouseholdImageUsageRepository(db as unknown as D1Database).ensureUsageRow("house-1", "2026-08-05T00:00:00.000Z");
    const item = reservation("failed-1"); await new ImageUploadReservationRepository(db as unknown as D1Database).createReservation(item);
    db.householdImageUsage.set("house-1", { ...db.householdImageUsage.get("house-1")!, reserved_count: 1, reserved_bytes: 10 }); bucket.deleteFailures.set(item.r2Key, new Error("delete failed"));
    const result = await new ExpiredImageReservationCleanupService(db as unknown as D1Database, bucket as unknown as R2Bucket).run("2026-08-05T01:00:00.000Z");
    expect(result).toMatchObject({ scanned: 1, released: 1, queuedForCleanup: 1 }); expect(db.imageUploadReservations.size).toBe(0); expect(db.orphanR2Objects.get("orphan") ?? Array.from(db.orphanR2Objects.values())[0]).toMatchObject({ byte_size: 10 }); expect(db.householdImageUsage.get("house-1")).toMatchObject({ reserved_count: 0, reserved_bytes: 0, pending_cleanup_bytes: 10 });
    await new ExpiredImageReservationCleanupService(db as unknown as D1Database, bucket as unknown as R2Bucket).run("2026-08-06T01:00:00.000Z");
    expect(db.householdImageUsage.get("house-1")).toMatchObject({ reserved_count: 0, reserved_bytes: 0, pending_cleanup_bytes: 10 });
  });

  it("does not process finalized or released rows and respects the batch limit", async () => {
    const db = new MemoryD1(); const bucket = new MemoryR2(); const usage = new HouseholdImageUsageRepository(db as unknown as D1Database);
    await usage.ensureUsageRow("house-1", "2026-08-05T00:00:00.000Z"); const repo = new ImageUploadReservationRepository(db as unknown as D1Database);
    await repo.createReservation(reservation("finalized-1", "finalized")); await repo.createReservation(reservation("released-1", "released"));
    for (let index = 0; index < 51; index++) await repo.createReservation(reservation(`expired-${index}`));
    const result = await new ExpiredImageReservationCleanupService(db as unknown as D1Database, bucket as unknown as R2Bucket).run("2026-08-05T01:00:00.000Z");
    expect(result.scanned).toBe(50); expect(db.imageUploadReservations.size).toBe(3);
  });

  it("treats an existing cleanup queue row as the source of truth", async () => {
    const db = new MemoryD1(); const bucket = new MemoryR2();
    const repo = new ImageUploadReservationRepository(db as unknown as D1Database);
    const queue = new OrphanR2ObjectRepository(db as unknown as D1Database);
    const item = reservation("cleanup-pending-1", "cleanup_pending");
    await repo.createReservation(item);
    await queue.enqueue({ id: "queue-cleanup-pending-1", r2Key: item.r2Key, sourceType: "manual_reconciliation", householdId: item.householdId, byteSize: item.byteSize, reason: "already queued", firstFailedAt: item.createdAt, nextAttemptAt: item.createdAt, now: item.createdAt });
    const result = await new ExpiredImageReservationCleanupService(db as unknown as D1Database, bucket as unknown as R2Bucket).run("2026-08-06T00:00:00.000Z");
    expect(result.released).toBe(1); expect(bucket.objects.size).toBe(0); expect(db.imageUploadReservations.has(item.id)).toBe(false); expect((await queue.findByR2Key(item.r2Key))?.byteSize).toBe(item.byteSize);
  });
});
