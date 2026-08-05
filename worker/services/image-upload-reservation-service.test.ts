import { describe, expect, it } from "vitest";
import { ImageUploadReservationService } from "./image-upload-reservation-service";
import { HouseholdImageUsageRepository } from "../repositories/household-image-usage-repository";
import { MemoryD1 } from "../test-utils/memory-d1";
import { ImageUploadReservationRepository } from "../repositories/image-upload-reservation-repository";
import { OrphanR2ObjectRepository } from "../repositories/orphan-r2-object-repository";

const image = (sizeBytes: number) => ({ id: "old-image", shoppingItemId: "item-1", householdId: "house-1", r2Key: "old-key", contentType: "image/webp" as const, sizeBytes, width: 10, height: 10, createdBy: "u1", createdAt: "2026-08-04T00:00:00.000Z", updatedAt: "2026-08-04T00:00:00.000Z" });

describe("ImageUploadReservationService", () => {
  it("reserves create and replace uploads with the correct projections", async () => {
    const db = new MemoryD1();
    const usage = new HouseholdImageUsageRepository(db as unknown as D1Database);
    await usage.ensureUsageRow("house-1", "2026-08-05T00:00:00.000Z");
    db.householdImageUsage.set("house-1", { ...db.householdImageUsage.get("house-1")!, active_count: 1, active_bytes: 100, daily_upload_date: "2026-08-05" });
    const service = new ImageUploadReservationService(db as unknown as D1Database, { IMAGE_ACTIVE_COUNT_LIMIT: "3", IMAGE_ACTIVE_BYTES_LIMIT: "1000", IMAGE_STORED_BYTES_LIMIT: "1000", IMAGE_DAILY_UPLOAD_LIMIT: "20", IMAGE_UPLOAD_RESERVATION_TTL_SECONDS: "900" });
    const create = await service.reserve({ householdId: "house-1", shoppingItemId: "item-2", r2Key: "new-key", byteSize: 200, oldImage: null, now: new Date("2026-08-05T01:00:00.000Z") });
    expect(create.operation).toBe("create");
    expect(db.householdImageUsage.get("house-1")).toMatchObject({ reserved_count: 1, reserved_bytes: 200 });
    await service.release(create);
    await service.release(create);
    expect(db.householdImageUsage.get("house-1")).toMatchObject({ reserved_count: 0, reserved_bytes: 0 });
    const replace = await service.reserve({ householdId: "house-1", shoppingItemId: "item-1", r2Key: "replace-key", byteSize: 150, oldImage: image(100), now: new Date("2026-08-05T02:00:00.000Z") });
    expect(replace.operation).toBe("replace");
    expect(replace.expiresAt).toBe("2026-08-05T02:15:00.000Z");
  });

  it("rejects unknown cleanup capacity, limits, and same-item conflicts", async () => {
    const db = new MemoryD1();
    const usage = new HouseholdImageUsageRepository(db as unknown as D1Database);
    await usage.ensureUsageRow("house-1", "2026-08-05T00:00:00.000Z");
    db.orphanR2Objects.set("orphan", { id: "orphan", r2_key: "key", source_type: "manual_reconciliation", source_id: null, household_id: "house-1", byte_size: null, reason: "test", status: "pending", attempt_count: 0, first_failed_at: "2026-08-05T00:00:00.000Z", last_attempted_at: null, next_attempt_at: "2026-08-06T00:00:00.000Z", last_error_code: null, last_error_message: null, created_at: "2026-08-05T00:00:00.000Z", updated_at: "2026-08-05T00:00:00.000Z" });
    const service = new ImageUploadReservationService(db as unknown as D1Database, {});
    await expect(service.reserve({ householdId: "house-1", shoppingItemId: "item-1", r2Key: "key", byteSize: 10, oldImage: null, now: new Date("2026-08-05T01:00:00.000Z") })).rejects.toMatchObject({ code: "IMAGE_STORED_BYTES_UNKNOWN", status: 409 });
  });

  it("finalizes create and replace atomically and does not double count", async () => {
    const db = new MemoryD1();
    const usage = new HouseholdImageUsageRepository(db as unknown as D1Database);
    await usage.ensureUsageRow("house-1", "2026-08-05T00:00:00.000Z");
    const service = new ImageUploadReservationService(db as unknown as D1Database, {});
    const create = await service.reserve({ householdId: "house-1", shoppingItemId: "item-1", r2Key: "create-key", byteSize: 100, oldImage: null, now: new Date("2026-08-05T01:00:00.000Z") });
    const createImage = { id: "image-1", shoppingItemId: "item-1", householdId: "house-1", r2Key: "create-key", contentType: "image/webp" as const, sizeBytes: 100, width: 10, height: 10, createdBy: "u1", createdAt: "2026-08-05T01:00:00.000Z", updatedAt: "2026-08-05T01:00:00.000Z" };
    const repository = new ImageUploadReservationRepository(db as unknown as D1Database);
    await expect(repository.finalizeAtomically(create, createImage, "2026-08-05T01:00:00.000Z")).resolves.toBe(true);
    expect(db.householdImageUsage.get("house-1")).toMatchObject({ active_count: 1, active_bytes: 100, reserved_count: 0, reserved_bytes: 0, daily_upload_count: 1, daily_upload_date: "2026-08-05" });
    await expect(repository.finalizeAtomically(create, createImage, "2026-08-05T01:01:00.000Z")).resolves.toBe(false);
    expect(db.householdImageUsage.get("house-1")).toMatchObject({ active_count: 1, active_bytes: 100, daily_upload_count: 1 });

    const old = image(100);
    db.householdImageUsage.set("house-1", { ...db.householdImageUsage.get("house-1")!, daily_upload_date: "2026-08-04", daily_upload_count: 19 });
    const replace = await service.reserve({ householdId: "house-1", shoppingItemId: "item-1", r2Key: "replace-key", byteSize: 150, oldImage: old, now: new Date("2026-08-05T02:00:00.000Z") });
    const replaceImage = { ...createImage, id: "image-2", r2Key: "replace-key", sizeBytes: 150, updatedAt: "2026-08-05T02:00:00.000Z" };
    await expect(repository.finalizeAtomically(replace, replaceImage, "2026-08-05T02:00:00.000Z")).resolves.toBe(true);
    expect(db.householdImageUsage.get("house-1")).toMatchObject({ active_count: 1, active_bytes: 150, reserved_count: 0, reserved_bytes: 0, daily_upload_count: 1, daily_upload_date: "2026-08-05" });
  });

  it("updates pending cleanup bytes atomically and deduplicates queue keys", async () => {
    const db = new MemoryD1();
    const usage = new HouseholdImageUsageRepository(db as unknown as D1Database);
    await usage.ensureUsageRow("house-1", "2026-08-05T00:00:00.000Z");
    const queue = new OrphanR2ObjectRepository(db as unknown as D1Database);
    const input = { id: "orphan-1", r2Key: "old-key", sourceType: "shopping_item_image_replace" as const, sourceId: "item-1", householdId: "house-1", byteSize: 100, reason: "delete failed", firstFailedAt: "2026-08-05T01:00:00.000Z", nextAttemptAt: "2026-09-04T01:00:00.000Z", now: "2026-08-05T01:00:00.000Z" };
    await queue.enqueue(input);
    await queue.enqueue({ ...input, id: "orphan-2", byteSize: 100, now: "2026-08-05T02:00:00.000Z" });
    expect(db.householdImageUsage.get("house-1")).toMatchObject({ pending_cleanup_bytes: 100 });
    expect(db.orphanR2Objects.size).toBe(1);
  });

  it("rolls back usage and reservation when metadata upsert fails", async () => {
    const db = new MemoryD1((sql) => { if (sql.startsWith("INSERT INTO shopping_item_images")) throw new Error("metadata failure"); });
    const usage = new HouseholdImageUsageRepository(db as unknown as D1Database);
    await usage.ensureUsageRow("house-1", "2026-08-05T00:00:00.000Z");
    const service = new ImageUploadReservationService(db as unknown as D1Database, {});
    const reservation = await service.reserve({ householdId: "house-1", shoppingItemId: "item-1", r2Key: "key", byteSize: 100, oldImage: null, now: new Date("2026-08-05T01:00:00.000Z") });
    const repository = new ImageUploadReservationRepository(db as unknown as D1Database);
    await expect(repository.finalizeAtomically(reservation, { id: "image-1", shoppingItemId: "item-1", householdId: "house-1", r2Key: "key", contentType: "image/webp", sizeBytes: 100, width: 10, height: 10, createdBy: "u1", createdAt: "2026-08-05T01:00:00.000Z", updatedAt: "2026-08-05T01:00:00.000Z" }, "2026-08-05T01:00:00.000Z")).rejects.toThrow("metadata failure");
    expect(db.householdImageUsage.get("house-1")).toMatchObject({ active_count: 0, active_bytes: 0, reserved_count: 1, reserved_bytes: 100, daily_upload_count: 0 });
    expect(db.imageUploadReservations.get(reservation.id)?.status).toBe("reserved");
  });
});
