import { describe, expect, it } from "vitest";
import { HouseholdImageUsageRepository } from "./repositories/household-image-usage-repository";
import { ImageUploadReservationRepository } from "./repositories/image-upload-reservation-repository";
import { HouseholdImageUsageService } from "./services/household-image-usage-service";
import { MemoryD1 } from "./test-utils/memory-d1";

const household = (db: MemoryD1, id: string, userId: string, role: "owner" | "member" = "owner") => {
  db.households.set(id, { id, name: id, timezone: "Asia/Tokyo", week_starts_on: 1, created_by: userId, created_at: "2026-08-05T00:00:00.000Z", updated_at: "2026-08-05T00:00:00.000Z" });
  db.members.set(`${id}:${userId}`, { household_id: id, user_id: userId, role, color: null, joined_at: "2026-08-05T00:00:00.000Z" });
};

describe("household image usage foundation", () => {
  it("repairs active, reservation, and known pending cleanup bytes idempotently", async () => {
    const db = new MemoryD1(); household(db, "h1", "u1"); household(db, "h2", "u2");
    db.shoppingItemImages.set("image-1", { id: "image-1", shopping_item_id: "item-1", household_id: "h1", r2_key: "key-1", content_type: "image/webp", size_bytes: 100, width: 10, height: 10, created_by: "u1", created_at: "2026-08-05T00:00:00.000Z", updated_at: "2026-08-05T00:00:00.000Z" });
    db.shoppingItemImages.set("image-2", { id: "image-2", shopping_item_id: "item-2", household_id: "h1", r2_key: "key-2", content_type: "image/webp", size_bytes: 200, width: 10, height: 10, created_by: "u1", created_at: "2026-08-05T00:00:00.000Z", updated_at: "2026-08-05T00:00:00.000Z" });
    db.orphanR2Objects.set("orphan-1", { id: "orphan-1", r2_key: "old-1", source_type: "shopping_item_image_replace", source_id: "item-1", household_id: "h1", byte_size: 50, reason: "test", status: "retry", attempt_count: 1, first_failed_at: "2026-08-01T00:00:00.000Z", last_attempted_at: null, next_attempt_at: "2026-08-02T00:00:00.000Z", last_error_code: null, last_error_message: null, created_at: "2026-08-01T00:00:00.000Z", updated_at: "2026-08-01T00:00:00.000Z" });
    db.orphanR2Objects.set("orphan-unknown", { ...db.orphanR2Objects.get("orphan-1")!, id: "orphan-unknown", r2_key: "old-unknown", byte_size: null });
    const repository = new HouseholdImageUsageRepository(db as unknown as D1Database);
    await repository.repairUsage("h1", "2026-08-05T00:00:00.000Z");
    await repository.repairUsage("h1", "2026-08-05T00:00:00.000Z");
    await repository.repairUsage("h2", "2026-08-05T00:00:00.000Z");
    await expect(repository.getUsage("h1")).resolves.toMatchObject({ activeCount: 2, activeBytes: 300, pendingCleanupBytes: 50 });
    await expect(repository.getUnknownPendingCleanupCount("h1")).resolves.toBe(1);
    await expect(repository.getUsage("h2")).resolves.toMatchObject({ activeCount: 0, activeBytes: 0 });
  });

  it("counts reservations and resets only when the UTC date changes", async () => {
    const db = new MemoryD1(); household(db, "h1", "u1");
    const reservations = new ImageUploadReservationRepository(db as unknown as D1Database);
    await reservations.createReservation({ id: "r1", householdId: "h1", shoppingItemId: "item-1", operation: "create", status: "reserved", r2Key: "key-1", byteSize: 123, oldImageId: null, oldR2Key: null, oldSizeBytes: null, expiresAt: "2026-08-05T00:15:00.000Z", createdAt: "2026-08-05T00:00:00.000Z", updatedAt: "2026-08-05T00:00:00.000Z" });
    const usage = new HouseholdImageUsageRepository(db as unknown as D1Database);
    await usage.repairUsage("h1", "2026-08-05T00:00:00.000Z");
    await expect(usage.getUsage("h1")).resolves.toMatchObject({ reservedCount: 1, reservedBytes: 123 });
    db.householdImageUsage.get("h1")!.daily_upload_date = "2026-08-05";
    db.householdImageUsage.get("h1")!.daily_upload_count = 3;
    await usage.resetDailyCounterIfNeeded("h1", "2026-08-05", "2026-08-05T01:00:00.000Z");
    expect(db.householdImageUsage.get("h1")?.daily_upload_count).toBe(3);
    await usage.resetDailyCounterIfNeeded("h1", "2026-08-06", "2026-08-06T00:00:00.000Z");
    expect(db.householdImageUsage.get("h1")).toMatchObject({ daily_upload_date: "2026-08-06", daily_upload_count: 0 });
  });

  it("exposes limits and known/unknown stored usage without R2 access", async () => {
    const db = new MemoryD1(); household(db, "h1", "u1");
    db.orphanR2Objects.set("orphan-unknown", { id: "orphan-unknown", r2_key: "old-unknown", source_type: "manual_reconciliation", source_id: null, household_id: "h1", byte_size: null, reason: "test", status: "abandoned", attempt_count: 5, first_failed_at: "2026-08-01T00:00:00.000Z", last_attempted_at: null, next_attempt_at: "2026-08-02T00:00:00.000Z", last_error_code: null, last_error_message: null, created_at: "2026-08-01T00:00:00.000Z", updated_at: "2026-08-01T00:00:00.000Z" });
    const service = new HouseholdImageUsageService(db as unknown as D1Database, { IMAGE_ACTIVE_COUNT_LIMIT: "10", IMAGE_ACTIVE_BYTES_LIMIT: "1000", IMAGE_STORED_BYTES_LIMIT: "1500", IMAGE_DAILY_UPLOAD_LIMIT: "4", IMAGE_UPLOAD_RESERVATION_TTL_SECONDS: "60" });
    await expect(service.getForUser("u1", new Date("2026-08-05T00:00:00.000Z"))).resolves.toMatchObject({ activeCountLimit: 10, activeBytesLimit: 1000, storedBytesLimit: 1500, pendingCleanupUnknownCount: 1, storedBytesKnown: false, dailyUploadDate: "2026-08-05" });
  });

  it("allows only one active reservation per shopping item", async () => {
    const db = new MemoryD1(); const repository = new ImageUploadReservationRepository(db as unknown as D1Database);
    const input = { id: "r1", householdId: "h1", shoppingItemId: "item-1", operation: "create" as const, status: "reserved" as const, r2Key: "key-1", byteSize: 10, oldImageId: null, oldR2Key: null, oldSizeBytes: null, expiresAt: "2026-08-05T00:15:00.000Z", createdAt: "2026-08-05T00:00:00.000Z", updatedAt: "2026-08-05T00:00:00.000Z" };
    await repository.createReservation(input);
    await expect(repository.createReservation({ ...input, id: "r2", r2Key: "key-2" })).rejects.toMatchObject({ code: "CONFLICT", status: 409 });
    await expect(repository.listExpiredReservations("2026-08-06T00:00:00.000Z")).resolves.toHaveLength(1);
  });
});
