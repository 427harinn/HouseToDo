import { IMAGE_UPLOAD_RESERVATION_CLEANUP_BATCH_SIZE, ORPHAN_R2_RETENTION_DAYS } from "../lib/constants";
import { ImageUploadReservationRepository, type ImageUploadReservation } from "../repositories/image-upload-reservation-repository";
import { OrphanR2ObjectRepository } from "../repositories/orphan-r2-object-repository";
import { HouseholdImageUsageRepository } from "../repositories/household-image-usage-repository";

export type ExpiredImageReservationCleanupResult = { scanned: number; released: number; r2Deleted: number; queuedForCleanup: number; failed: number; householdsRepaired: number };

const masked = (value: string) => value.slice(-8);

export class ExpiredImageReservationCleanupService {
  private readonly reservations: ImageUploadReservationRepository;
  private readonly queue: OrphanR2ObjectRepository;
  private readonly usage: HouseholdImageUsageRepository;

  constructor(private readonly db: D1Database, private readonly bucket: R2Bucket) {
    this.reservations = new ImageUploadReservationRepository(db);
    this.queue = new OrphanR2ObjectRepository(db);
    this.usage = new HouseholdImageUsageRepository(db);
  }

  async run(now = new Date().toISOString(), limit = IMAGE_UPLOAD_RESERVATION_CLEANUP_BATCH_SIZE): Promise<ExpiredImageReservationCleanupResult> {
    const result: ExpiredImageReservationCleanupResult = { scanned: 0, released: 0, r2Deleted: 0, queuedForCleanup: 0, failed: 0, householdsRepaired: 0 };
    const records = await this.reservations.listExpiredReservations(now, Math.min(limit, IMAGE_UPLOAD_RESERVATION_CLEANUP_BATCH_SIZE));
    result.scanned = records.length;
    for (const reservation of records) {
      try {
        await this.usage.ensureAndRecalculatePendingCleanupUsage(reservation.householdId, now);
        const queuedObject = await this.queue.findByR2Key(reservation.r2Key);
        if (!queuedObject) {
          try {
            await this.bucket.delete(reservation.r2Key);
            result.r2Deleted++;
          } catch (error) {
            const queued = await this.enqueueExpiredObject(reservation, now, error);
            if (!queued) throw error;
            result.queuedForCleanup++;
          }
        }
        if (await this.reservations.releaseExpiredAtomically(reservation, now)) {
          result.released++;
          result.householdsRepaired++;
        }
      } catch (error) {
        result.failed++;
        console.error(JSON.stringify({ event: "expired_image_reservation_cleanup_item_failed", reservationIdSuffix: masked(reservation.id), householdIdSuffix: masked(reservation.householdId), errorCode: "RESERVATION_CLEANUP_FAILED", errorName: error instanceof Error ? error.name : "UnknownError" }));
      }
    }
    return result;
  }

  private async enqueueExpiredObject(reservation: ImageUploadReservation, now: string, error: unknown): Promise<boolean> {
    await this.queue.enqueue({
      id: crypto.randomUUID(), r2Key: reservation.r2Key, sourceType: "manual_reconciliation", sourceId: reservation.shoppingItemId,
      householdId: reservation.householdId, byteSize: reservation.byteSize, reason: `expired upload reservation cleanup failed: ${error instanceof Error ? error.name : "unknown"}`,
      firstFailedAt: now, nextAttemptAt: new Date(new Date(now).getTime() + ORPHAN_R2_RETENTION_DAYS * 86400000).toISOString(), now
    });
    return true;
  }
}

export const runExpiredImageReservationCleanup = (env: { DB: D1Database; ATTACHMENTS: R2Bucket }) => new ExpiredImageReservationCleanupService(env.DB, env.ATTACHMENTS).run();
