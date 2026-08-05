import { utcDateKey, expiresAtFromSeconds } from "../lib/date";
import { getImageLimits } from "../lib/image-limits";
import { AppError } from "../lib/errors";
import { HouseholdImageUsageRepository } from "../repositories/household-image-usage-repository";
import { ImageUploadReservationRepository, type ImageUploadReservation } from "../repositories/image-upload-reservation-repository";
import type { ShoppingItemImage } from "../types/domain";

type ReservationInput = {
  householdId: string;
  shoppingItemId: string;
  r2Key: string;
  byteSize: number;
  oldImage: ShoppingItemImage | null;
  now?: Date;
};

const limitError = (code: AppError["code"], status: number, message: string, details: Record<string, string>) =>
  new AppError({ code, status, message, details });

export class ImageUploadReservationService {
  private readonly usage: HouseholdImageUsageRepository;
  private readonly reservations: ImageUploadReservationRepository;
  private readonly limits: ReturnType<typeof getImageLimits>;

  constructor(private readonly db: D1Database, env: Parameters<typeof getImageLimits>[0]) {
    this.usage = new HouseholdImageUsageRepository(db);
    this.reservations = new ImageUploadReservationRepository(db);
    this.limits = getImageLimits(env);
  }

  async reserve(input: ReservationInput): Promise<ImageUploadReservation> {
    const now = input.now ?? new Date();
    const nowIso = now.toISOString();
    const currentDate = utcDateKey(now);
    const dayStart = `${currentDate}T00:00:00.000Z`;
    const next = new Date(now.getTime() + 86400000).toISOString();
    const usage = await this.usage.resetDailyCounterIfNeeded(input.householdId, currentDate, nowIso);
    if (!usage) throw new Error("household image usage row was not created");
    if (await this.reservations.findActiveByShoppingItemId(input.shoppingItemId)) {
      throw new AppError({ code: "IMAGE_UPLOAD_IN_PROGRESS", status: 409, message: "An image upload is already in progress." });
    }
    const unknownCount = await this.usage.getUnknownPendingCleanupCount(input.householdId);
    if (unknownCount > 0) {
      throw new AppError({ code: "IMAGE_STORED_BYTES_UNKNOWN", status: 409, message: "Deleted image capacity is unknown, so new uploads are temporarily unavailable." });
    }
    const summary = await this.reservations.getUsageSummary(input.householdId, dayStart, next);
    const replace = input.oldImage !== null;
    const projectedActiveCount = usage.activeCount + summary.createCount + (replace ? 0 : 1);
    const projectedActiveBytes = usage.activeBytes + summary.activeBytes + (replace ? input.byteSize - (input.oldImage?.sizeBytes ?? 0) : input.byteSize);
    const projectedStoredBytes = usage.activeBytes + usage.reservedBytes + usage.pendingCleanupBytes + input.byteSize;
    const dailyCurrent = usage.dailyUploadCount + summary.todayCount;
    if (projectedActiveCount > this.limits.activeCount) throw limitError("IMAGE_COUNT_LIMIT_REACHED", 409, "Image count limit reached.", { current: String(usage.activeCount + summary.createCount), limit: String(this.limits.activeCount), projected: String(projectedActiveCount) });
    if (projectedActiveBytes > this.limits.activeBytes) throw limitError("IMAGE_ACTIVE_BYTES_LIMIT_REACHED", 409, "Active image bytes limit reached.", { current: String(usage.activeBytes + summary.activeBytes), limit: String(this.limits.activeBytes), projected: String(projectedActiveBytes) });
    if (projectedStoredBytes > this.limits.storedBytes) throw limitError("IMAGE_STORED_BYTES_LIMIT_REACHED", 409, "Stored image bytes limit reached.", { currentKnown: String(usage.activeBytes + usage.reservedBytes + usage.pendingCleanupBytes), limit: String(this.limits.storedBytes), projectedKnown: String(projectedStoredBytes) });
    if (dailyCurrent >= this.limits.dailyUploads) throw limitError("IMAGE_DAILY_UPLOAD_LIMIT_REACHED", 429, "Daily image upload limit reached.", { current: String(dailyCurrent), limit: String(this.limits.dailyUploads) });

    const reservation: ImageUploadReservation = {
      id: crypto.randomUUID(), householdId: input.householdId, shoppingItemId: input.shoppingItemId,
      operation: replace ? "replace" : "create", status: "reserved", r2Key: input.r2Key, byteSize: input.byteSize,
      oldImageId: input.oldImage?.id ?? null, oldR2Key: input.oldImage?.r2Key ?? null, oldSizeBytes: input.oldImage?.sizeBytes ?? null,
      expiresAt: expiresAtFromSeconds(this.limits.reservationTtlSeconds, now), createdAt: nowIso, updatedAt: nowIso
    };
    const committed = await this.reservations.reserveAtomically(reservation, this.limits, { dayStart, dayEnd: next, priorReservedCount: usage.reservedCount, priorReservedBytes: usage.reservedBytes, activeDelta: replace ? input.byteSize - (input.oldImage?.sizeBytes ?? 0) : input.byteSize });
    if (!committed) {
      if (await this.reservations.findActiveByShoppingItemId(input.shoppingItemId)) throw new AppError({ code: "IMAGE_UPLOAD_IN_PROGRESS", status: 409, message: "An image upload is already in progress." });
      throw new AppError({ code: "CONFLICT", status: 409, message: "Image upload reservation could not be created." });
    }
    return reservation;
  }

  async release(reservation: ImageUploadReservation, now = new Date()): Promise<void> {
    await this.reservations.releaseAtomically(reservation.id, reservation.householdId, reservation.byteSize, now.toISOString());
  }

  async finalize(reservation: ImageUploadReservation, image: ShoppingItemImage, now: string): Promise<boolean> {
    return this.reservations.finalizeAtomically(reservation, image, now);
  }
}
