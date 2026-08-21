import { nowIso } from "../lib/date";

export type HouseholdImageUsage = {
  householdId: string;
  activeCount: number;
  activeBytes: number;
  reservedCount: number;
  reservedBytes: number;
  pendingCleanupBytes: number;
  dailyUploadDate: string | null;
  dailyUploadCount: number;
  updatedAt: string;
};

type UsageRow = {
  household_id: string;
  active_count: number;
  active_bytes: number;
  reserved_count: number;
  reserved_bytes: number;
  pending_cleanup_bytes: number;
  daily_upload_date: string | null;
  daily_upload_count: number;
  updated_at: string;
};

const map = (row: UsageRow | null): HouseholdImageUsage | null =>
  row
    ? {
        householdId: row.household_id,
        activeCount: row.active_count,
        activeBytes: row.active_bytes,
        reservedCount: row.reserved_count,
        reservedBytes: row.reserved_bytes,
        pendingCleanupBytes: row.pending_cleanup_bytes,
        dailyUploadDate: row.daily_upload_date,
        dailyUploadCount: row.daily_upload_count,
        updatedAt: row.updated_at
      }
    : null;

export class HouseholdImageUsageRepository {
  constructor(private readonly db: D1Database) {}

  async ensureUsageRow(householdId: string, now = nowIso()): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO household_image_usage (household_id, updated_at) VALUES (?, ?)
       ON CONFLICT(household_id) DO NOTHING`
      )
      .bind(householdId, now)
      .run();
  }

  async getUsage(householdId: string): Promise<HouseholdImageUsage | null> {
    return map(
      await this.db
        .prepare("SELECT * FROM household_image_usage WHERE household_id = ?")
        .bind(householdId)
        .first<UsageRow>()
    );
  }

  async recalculateActiveUsage(householdId: string, now = nowIso()): Promise<void> {
    await this.db
      .prepare(
        `UPDATE household_image_usage
       SET active_count = (SELECT COUNT(*) FROM shopping_item_images WHERE household_id = ?)
         + (SELECT COUNT(*) FROM users u INNER JOIN household_members hm ON hm.user_id = u.id AND hm.household_id = ? WHERE u.avatar_type = 'r2'),
           active_bytes = (SELECT COALESCE(SUM(size_bytes), 0) FROM shopping_item_images WHERE household_id = ?)
         + (SELECT COALESCE(SUM(u.avatar_size_bytes), 0) FROM users u INNER JOIN household_members hm ON hm.user_id = u.id AND hm.household_id = ? WHERE u.avatar_type = 'r2'),
           updated_at = ?
       WHERE household_id = ?`
      )
      .bind(householdId, householdId, householdId, householdId, now, householdId)
      .run();
  }

  prepareApplyAvatarUpdate(input: {
    householdId: string;
    oldSizeBytes: number;
    newSizeBytes: number;
    isCreate: boolean;
    now: string;
    currentDate: string;
    activeBytesLimit: number;
    activeCountLimit: number;
    storedBytesLimit: number;
    dailyUploadLimit: number;
  }): D1PreparedStatement {
    const countDelta = input.isCreate ? 1 : 0;
    const byteDelta = input.newSizeBytes - input.oldSizeBytes;
    return this.db
      .prepare(
        `UPDATE household_image_usage
       SET active_count = active_count + ?, active_bytes = active_bytes + ?,
           daily_upload_date = ?, daily_upload_count = daily_upload_count + 1, updated_at = ?
       WHERE household_id = ?
         AND active_count + ? <= ?
         AND active_bytes + ? <= ?
         AND active_bytes + reserved_bytes + pending_cleanup_bytes + ? <= ?
         AND daily_upload_count < ?`
      )
      .bind(
        countDelta,
        byteDelta,
        input.currentDate,
        input.now,
        input.householdId,
        countDelta,
        input.activeCountLimit,
        byteDelta,
        input.activeBytesLimit,
        input.newSizeBytes,
        input.storedBytesLimit,
        input.dailyUploadLimit
      );
  }

  prepareApplyAvatarRemoval(input: {
    householdId: string;
    sizeBytes: number;
    now: string;
  }): D1PreparedStatement {
    return this.db
      .prepare(
        `UPDATE household_image_usage SET active_count = MAX(0, active_count - 1), active_bytes = MAX(0, active_bytes - ?), updated_at = ?
       WHERE household_id = ? AND active_count > 0 AND active_bytes >= ?`
      )
      .bind(input.sizeBytes, input.now, input.householdId, input.sizeBytes);
  }

  async recalculatePendingCleanupUsage(
    householdId: string,
    now = nowIso()
  ): Promise<void> {
    await this.db
      .prepare(
        `UPDATE household_image_usage
       SET pending_cleanup_bytes = (
         SELECT COALESCE(SUM(byte_size), 0) FROM orphan_r2_objects
         WHERE household_id = ? AND byte_size IS NOT NULL
           AND status IN ('pending', 'retry', 'abandoned')
       ), updated_at = ?
       WHERE household_id = ?`
      )
      .bind(householdId, now, householdId)
      .run();
  }

  async recalculateReservationUsage(
    householdId: string,
    now = nowIso()
  ): Promise<void> {
    await this.db
      .prepare(
        `UPDATE household_image_usage
       SET reserved_count = (
             SELECT COUNT(*) FROM image_upload_reservations
             WHERE household_id = ? AND status IN ('reserved', 'r2_written', 'cleanup_pending')
           ),
           reserved_bytes = (
             SELECT COALESCE(SUM(byte_size), 0) FROM image_upload_reservations
             WHERE household_id = ? AND status IN ('reserved', 'r2_written', 'cleanup_pending')
           ), updated_at = ?
       WHERE household_id = ?`
      )
      .bind(householdId, householdId, now, householdId)
      .run();
  }

  async repairUsage(
    householdId: string,
    now = nowIso()
  ): Promise<HouseholdImageUsage | null> {
    await this.ensureUsageRow(householdId, now);
    await this.recalculateActiveUsage(householdId, now);
    await this.recalculateReservationUsage(householdId, now);
    await this.recalculatePendingCleanupUsage(householdId, now);
    return this.getUsage(householdId);
  }

  async resetDailyCounterIfNeeded(
    householdId: string,
    currentDate: string,
    now = nowIso()
  ): Promise<HouseholdImageUsage | null> {
    await this.ensureUsageRow(householdId, now);
    await this.db
      .prepare(
        `UPDATE household_image_usage
       SET daily_upload_date = ?, daily_upload_count = 0, updated_at = ?
       WHERE household_id = ? AND (daily_upload_date IS NULL OR daily_upload_date <> ?)`
      )
      .bind(currentDate, now, householdId, currentDate)
      .run();
    return this.getUsage(householdId);
  }

  async getUnknownPendingCleanupCount(householdId: string): Promise<number> {
    const row = await this.db
      .prepare(
        `SELECT COUNT(*) AS count FROM orphan_r2_objects
       WHERE household_id = ? AND byte_size IS NULL
         AND status IN ('pending', 'retry', 'abandoned')`
      )
      .bind(householdId)
      .first<{ count: number }>();
    return Number(row?.count ?? 0);
  }

  async ensureAndRecalculatePendingCleanupUsage(
    householdId: string,
    now = nowIso()
  ): Promise<boolean> {
    const household = await this.db
      .prepare("SELECT id FROM households WHERE id = ?")
      .bind(householdId)
      .first<{ id: string }>();
    if (!household) return false;
    await this.ensureUsageRow(householdId, now);
    await this.recalculatePendingCleanupUsage(householdId, now);
    return true;
  }
}
