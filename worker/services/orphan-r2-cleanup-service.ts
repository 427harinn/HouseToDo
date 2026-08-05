import { ORPHAN_R2_CLEANUP_BATCH_SIZE, ORPHAN_R2_ERROR_MESSAGE_MAX_LENGTH, ORPHAN_R2_MAX_ATTEMPTS, ORPHAN_R2_RETRY_DELAYS_DAYS } from "../lib/constants";
import { OrphanR2ObjectRepository } from "../repositories/orphan-r2-object-repository";
import { ShoppingItemImageRepository } from "../repositories/shopping-item-image-repository";
import { HouseholdImageUsageRepository } from "../repositories/household-image-usage-repository";
export type OrphanCleanupResult = { scanned: number; deleted: number; skippedReferenced: number; missingObjects: number; retried: number; abandoned: number; failed: number; usageRecalculated: number };
const errorInfo = (error: unknown) => ({ code: "R2_DELETE_FAILED", message: String(error instanceof Error ? error.message : error).slice(0, ORPHAN_R2_ERROR_MESSAGE_MAX_LENGTH) });
export class OrphanR2CleanupService {
  private readonly queue: OrphanR2ObjectRepository; private readonly images: ShoppingItemImageRepository; private readonly usage: HouseholdImageUsageRepository;
  constructor(private readonly db: D1Database, private readonly bucket: R2Bucket) { this.queue = new OrphanR2ObjectRepository(db); this.images = new ShoppingItemImageRepository(db); this.usage = new HouseholdImageUsageRepository(db); }
  async run(now = new Date().toISOString(), limit = ORPHAN_R2_CLEANUP_BATCH_SIZE): Promise<OrphanCleanupResult> {
    const result: OrphanCleanupResult = { scanned: 0, deleted: 0, skippedReferenced: 0, missingObjects: 0, retried: 0, abandoned: 0, failed: 0, usageRecalculated: 0 };
    const records = await this.queue.listDue(now, Math.min(limit, ORPHAN_R2_CLEANUP_BATCH_SIZE)); result.scanned = records.length;
    for (const record of records) {
      try {
        if (record.householdId) await this.usage.ensureAndRecalculatePendingCleanupUsage(record.householdId, now);
        if (await this.images.existsByR2Key(record.r2Key)) { const cleanup = await this.queue.deleteByIdAndRecalculate(record.id, record.householdId, now); if (cleanup.usageRecalculated) result.usageRecalculated++; result.skippedReferenced++; continue; }
        const object = await this.bucket.head(record.r2Key);
        if (!object) { const cleanup = await this.queue.deleteByIdAndRecalculate(record.id, record.householdId, now); if (cleanup.usageRecalculated) result.usageRecalculated++; result.missingObjects++; continue; }
        await this.bucket.delete(record.r2Key); const cleanup = await this.queue.deleteByIdAndRecalculate(record.id, record.householdId, now); if (cleanup.usageRecalculated) result.usageRecalculated++; result.deleted++;
      } catch (error) {
        const info = errorInfo(error); const attemptCount = record.attemptCount + 1; result.failed++;
        console.error(JSON.stringify({ event: "orphan_r2_cleanup_item_failed", queueIdSuffix: record.id.slice(-8), sourceType: record.sourceType, attemptCount, errorCode: info.code }));
        if (attemptCount >= ORPHAN_R2_MAX_ATTEMPTS) { const updated = await this.queue.markAbandonedAndRecalculate(record.id, record.householdId, { attemptCount, lastAttemptedAt: now, errorCode: info.code, errorMessage: info.message }); if (updated.usageRecalculated) result.usageRecalculated++; result.abandoned++; }
        else { const days = ORPHAN_R2_RETRY_DELAYS_DAYS[Math.min(attemptCount - 1, ORPHAN_R2_RETRY_DELAYS_DAYS.length - 1)]; const updated = await this.queue.markRetryAndRecalculate(record.id, record.householdId, { attemptCount, lastAttemptedAt: now, nextAttemptAt: new Date(new Date(now).getTime() + days * 86400000).toISOString(), errorCode: info.code, errorMessage: info.message }); if (updated.usageRecalculated) result.usageRecalculated++; result.retried++; }
      }
    }
    return result;
  }
}
export const runOrphanR2Cleanup = (env: { DB: D1Database; ATTACHMENTS: R2Bucket }) => new OrphanR2CleanupService(env.DB, env.ATTACHMENTS).run();
