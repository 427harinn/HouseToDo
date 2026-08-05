import { ORPHAN_R2_MAX_ATTEMPTS } from "../lib/constants";
export type OrphanSourceType = "shopping_item_image_replace" | "shopping_item_image_delete" | "shopping_item_delete" | "shopping_clear_purchased" | "manual_reconciliation";
export type OrphanStatus = "pending" | "retry" | "abandoned";
export type OrphanR2Object = {
  id: string; r2Key: string; sourceType: OrphanSourceType; sourceId: string | null; householdId: string | null;
  byteSize: number | null;
  reason: string; status: OrphanStatus; attemptCount: number; firstFailedAt: string; lastAttemptedAt: string | null;
  nextAttemptAt: string; lastErrorCode: string | null; lastErrorMessage: string | null; createdAt: string; updatedAt: string;
};
type Row = { id: string; r2_key: string; source_type: OrphanSourceType; source_id: string | null; household_id: string | null; byte_size: number | null; reason: string; status: OrphanStatus; attempt_count: number; first_failed_at: string; last_attempted_at: string | null; next_attempt_at: string; last_error_code: string | null; last_error_message: string | null; created_at: string; updated_at: string };
const map = (r: Row | null): OrphanR2Object | null => r ? ({ id: r.id, r2Key: r.r2_key, sourceType: r.source_type, sourceId: r.source_id, householdId: r.household_id, byteSize: r.byte_size, reason: r.reason, status: r.status, attemptCount: r.attempt_count, firstFailedAt: r.first_failed_at, lastAttemptedAt: r.last_attempted_at, nextAttemptAt: r.next_attempt_at, lastErrorCode: r.last_error_code, lastErrorMessage: r.last_error_message, createdAt: r.created_at, updatedAt: r.updated_at }) : null;
export type EnqueueOrphanInput = { id: string; r2Key: string; sourceType: OrphanSourceType; sourceId?: string | null; householdId?: string | null; byteSize?: number | null; reason: string; firstFailedAt: string; nextAttemptAt: string; now: string; };
export class OrphanR2ObjectRepository {
  constructor(private readonly db: D1Database) {}
  async findByR2Key(key: string) { return map(await this.db.prepare("SELECT * FROM orphan_r2_objects WHERE r2_key = ?").bind(key).first<Row>()); }
  async enqueue(input: EnqueueOrphanInput): Promise<OrphanR2Object> {
    const existing = await this.findByR2Key(input.r2Key);
    if (existing?.householdId && input.householdId && existing.householdId !== input.householdId) throw new Error("orphan R2 key household mismatch");
    const insert = this.db.prepare(`INSERT INTO orphan_r2_objects (id, r2_key, source_type, source_id, household_id, byte_size, reason, status, attempt_count, first_failed_at, last_attempted_at, next_attempt_at, last_error_code, last_error_message, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, NULL, ?, NULL, NULL, ?, ?) ON CONFLICT(r2_key) DO UPDATE SET source_type = excluded.source_type, source_id = excluded.source_id, household_id = excluded.household_id, byte_size = COALESCE(excluded.byte_size, orphan_r2_objects.byte_size), reason = excluded.reason, updated_at = excluded.updated_at`).bind(input.id, input.r2Key, input.sourceType, input.sourceId ?? null, input.householdId ?? null, input.byteSize ?? null, input.reason, input.firstFailedAt, input.nextAttemptAt, input.now, input.now);
    const statements = [insert];
    if (input.householdId) statements.push(this.db.prepare(
      `UPDATE household_image_usage SET pending_cleanup_bytes = (
         SELECT COALESCE(SUM(byte_size), 0) FROM orphan_r2_objects
         WHERE household_id = ? AND byte_size IS NOT NULL AND status IN ('pending', 'retry', 'abandoned')
       ), updated_at = ? WHERE household_id = ?`
    ).bind(input.householdId, input.now, input.householdId));
    await this.db.batch(statements);
    return (await this.findByR2Key(input.r2Key))!;
  }
  async listDue(now: string, limit: number) { const r = await this.db.prepare("SELECT * FROM orphan_r2_objects WHERE status IN ('pending', 'retry') AND next_attempt_at <= ? AND attempt_count < ? ORDER BY next_attempt_at ASC, first_failed_at ASC, id ASC LIMIT ?").bind(now, ORPHAN_R2_MAX_ATTEMPTS, limit).all<Row>(); return (r.results ?? []).map((x) => map(x)!); }
  async markRetry(id: string, input: { attemptCount: number; lastAttemptedAt: string; nextAttemptAt: string; errorCode: string; errorMessage: string }) { await this.db.prepare("UPDATE orphan_r2_objects SET status = 'retry', attempt_count = ?, last_attempted_at = ?, next_attempt_at = ?, last_error_code = ?, last_error_message = ?, updated_at = ? WHERE id = ?").bind(input.attemptCount, input.lastAttemptedAt, input.nextAttemptAt, input.errorCode, input.errorMessage, input.lastAttemptedAt, id).run(); }
  async markAbandoned(id: string, input: { attemptCount: number; lastAttemptedAt: string; errorCode: string; errorMessage: string }) { await this.db.prepare("UPDATE orphan_r2_objects SET status = 'abandoned', attempt_count = ?, last_attempted_at = ?, last_error_code = ?, last_error_message = ?, updated_at = ? WHERE id = ?").bind(input.attemptCount, input.lastAttemptedAt, input.errorCode, input.errorMessage, input.lastAttemptedAt, id).run(); }
  async deleteById(id: string) { await this.db.prepare("DELETE FROM orphan_r2_objects WHERE id = ?").bind(id).run(); }

  async deleteByIdAndRecalculate(id: string, householdId: string | null, now: string): Promise<{ deleted: boolean; usageRecalculated: boolean }> {
    if (!householdId) return { deleted: (await this.db.prepare("DELETE FROM orphan_r2_objects WHERE id = ?").bind(id).run()).meta.changes !== 0, usageRecalculated: false };
    const result = await this.db.batch([
      this.db.prepare("DELETE FROM orphan_r2_objects WHERE id = ?").bind(id),
      this.db.prepare(
        `UPDATE household_image_usage SET pending_cleanup_bytes = (
           SELECT COALESCE(SUM(byte_size), 0) FROM orphan_r2_objects
           WHERE household_id = ? AND byte_size IS NOT NULL AND status IN ('pending', 'retry', 'abandoned')
         ), updated_at = ? WHERE household_id = ? AND changes() > 0`
      ).bind(householdId, now, householdId)
    ]);
    return { deleted: (result[0]?.meta.changes ?? 0) > 0, usageRecalculated: (result[1]?.meta.changes ?? 0) > 0 };
  }

  async markRetryAndRecalculate(id: string, householdId: string | null, input: { attemptCount: number; lastAttemptedAt: string; nextAttemptAt: string; errorCode: string; errorMessage: string }): Promise<{ usageRecalculated: boolean }> {
    if (!householdId) { await this.markRetry(id, input); return { usageRecalculated: false }; }
    const result = await this.db.batch([
      this.db.prepare("UPDATE orphan_r2_objects SET status = 'retry', attempt_count = ?, last_attempted_at = ?, next_attempt_at = ?, last_error_code = ?, last_error_message = ?, updated_at = ? WHERE id = ?").bind(input.attemptCount, input.lastAttemptedAt, input.nextAttemptAt, input.errorCode, input.errorMessage, input.lastAttemptedAt, id),
      this.db.prepare(
        `UPDATE household_image_usage SET pending_cleanup_bytes = (
           SELECT COALESCE(SUM(byte_size), 0) FROM orphan_r2_objects
           WHERE household_id = ? AND byte_size IS NOT NULL AND status IN ('pending', 'retry', 'abandoned')
         ), updated_at = ? WHERE household_id = ? AND changes() > 0`
      ).bind(householdId, input.lastAttemptedAt, householdId)
    ]);
    return { usageRecalculated: (result[1]?.meta.changes ?? 0) > 0 };
  }

  async markAbandonedAndRecalculate(id: string, householdId: string | null, input: { attemptCount: number; lastAttemptedAt: string; errorCode: string; errorMessage: string }): Promise<{ usageRecalculated: boolean }> {
    if (!householdId) { await this.markAbandoned(id, input); return { usageRecalculated: false }; }
    const result = await this.db.batch([
      this.db.prepare("UPDATE orphan_r2_objects SET status = 'abandoned', attempt_count = ?, last_attempted_at = ?, last_error_code = ?, last_error_message = ?, updated_at = ? WHERE id = ?").bind(input.attemptCount, input.lastAttemptedAt, input.errorCode, input.errorMessage, input.lastAttemptedAt, id),
      this.db.prepare(
        `UPDATE household_image_usage SET pending_cleanup_bytes = (
           SELECT COALESCE(SUM(byte_size), 0) FROM orphan_r2_objects
           WHERE household_id = ? AND byte_size IS NOT NULL AND status IN ('pending', 'retry', 'abandoned')
         ), updated_at = ? WHERE household_id = ? AND changes() > 0`
      ).bind(householdId, input.lastAttemptedAt, householdId)
    ]);
    return { usageRecalculated: (result[1]?.meta.changes ?? 0) > 0 };
  }
}
