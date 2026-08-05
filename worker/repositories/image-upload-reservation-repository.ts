import { conflictError } from "../lib/errors";
import type { ShoppingItemImage } from "../types/domain";

export type ImageUploadReservationStatus = "reserved" | "r2_written" | "finalized" | "released" | "cleanup_pending";
export type ImageUploadOperation = "create" | "replace";
export type ImageUploadReservation = {
  id: string;
  householdId: string;
  shoppingItemId: string;
  operation: ImageUploadOperation;
  status: ImageUploadReservationStatus;
  r2Key: string;
  byteSize: number;
  oldImageId: string | null;
  oldR2Key: string | null;
  oldSizeBytes: number | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};

type Row = { id: string; household_id: string; shopping_item_id: string; operation: ImageUploadOperation; status: ImageUploadReservationStatus; r2_key: string; byte_size: number; old_image_id: string | null; old_r2_key: string | null; old_size_bytes: number | null; expires_at: string; created_at: string; updated_at: string };
const map = (row: Row | null): ImageUploadReservation | null => row ? ({ id: row.id, householdId: row.household_id, shoppingItemId: row.shopping_item_id, operation: row.operation, status: row.status, r2Key: row.r2_key, byteSize: row.byte_size, oldImageId: row.old_image_id, oldR2Key: row.old_r2_key, oldSizeBytes: row.old_size_bytes, expiresAt: row.expires_at, createdAt: row.created_at, updatedAt: row.updated_at }) : null;

export class ImageUploadReservationRepository {
  constructor(private readonly db: D1Database) {}

  async createReservation(input: ImageUploadReservation): Promise<ImageUploadReservation> {
    try {
      await this.db.prepare(
        `INSERT INTO image_upload_reservations
         (id, household_id, shopping_item_id, operation, status, r2_key, byte_size, old_image_id, old_r2_key, old_size_bytes, expires_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(input.id, input.householdId, input.shoppingItemId, input.operation, input.status, input.r2Key, input.byteSize, input.oldImageId, input.oldR2Key, input.oldSizeBytes, input.expiresAt, input.createdAt, input.updatedAt).run();
    } catch (error) {
      if (String(error).toLowerCase().includes("unique")) throw conflictError("An image upload is already in progress for this shopping item.");
      throw error;
    }
    return input;
  }

  async findActiveByShoppingItemId(shoppingItemId: string): Promise<ImageUploadReservation | null> {
    return map(await this.db.prepare(
      `SELECT * FROM image_upload_reservations
       WHERE shopping_item_id = ? AND status IN ('reserved', 'r2_written', 'cleanup_pending')`
    ).bind(shoppingItemId).first<Row>());
  }

  async getById(id: string): Promise<ImageUploadReservation | null> {
    return map(await this.db.prepare("SELECT * FROM image_upload_reservations WHERE id = ?").bind(id).first<Row>());
  }

  async updateStatus(id: string, status: ImageUploadReservationStatus, updatedAt: string): Promise<boolean> {
    const result = await this.db.prepare("UPDATE image_upload_reservations SET status = ?, updated_at = ? WHERE id = ?").bind(status, updatedAt, id).run();
    return (result.meta.changes ?? 0) > 0;
  }

  async deleteReservation(id: string): Promise<boolean> {
    const result = await this.db.prepare("DELETE FROM image_upload_reservations WHERE id = ?").bind(id).run();
    return (result.meta.changes ?? 0) > 0;
  }

  async listExpiredReservations(now: string, limit = 50): Promise<ImageUploadReservation[]> {
    const result = await this.db.prepare(
      `SELECT * FROM image_upload_reservations
       WHERE status IN ('reserved', 'r2_written', 'cleanup_pending') AND expires_at <= ?
       ORDER BY expires_at ASC, created_at ASC, id ASC LIMIT ?`
    ).bind(now, limit).all<Row>();
    return (result.results ?? []).map((row) => map(row)!);
  }

  async deleteExpiredReservation(id: string, now: string): Promise<boolean> {
    const result = await this.db.prepare(
      `DELETE FROM image_upload_reservations
       WHERE id = ? AND status IN ('reserved', 'r2_written', 'cleanup_pending') AND expires_at <= ?`
    ).bind(id, now).run();
    return (result.meta.changes ?? 0) > 0;
  }

  async releaseExpiredAtomically(reservation: ImageUploadReservation, now: string): Promise<boolean> {
    const result = await this.db.batch([
      this.db.prepare("DELETE FROM image_upload_reservations WHERE id = ? AND household_id = ? AND status IN ('reserved', 'r2_written', 'cleanup_pending') AND expires_at <= ?").bind(reservation.id, reservation.householdId, now),
      this.db.prepare(
        `UPDATE household_image_usage SET reserved_count = (
           SELECT COUNT(*) FROM image_upload_reservations WHERE household_id = ? AND status IN ('reserved', 'r2_written', 'cleanup_pending')
         ), reserved_bytes = (
           SELECT COALESCE(SUM(byte_size), 0) FROM image_upload_reservations WHERE household_id = ? AND status IN ('reserved', 'r2_written', 'cleanup_pending')
         ), updated_at = ? WHERE household_id = ? AND changes() > 0`
      ).bind(reservation.householdId, reservation.householdId, now, reservation.householdId)
    ]);
    return (result[0]?.meta.changes ?? 0) > 0;
  }

  async getUsageSummary(householdId: string, dayStart: string, dayEnd: string): Promise<{ createCount: number; createBytes: number; activeBytes: number; todayCount: number }> {
    const row = await this.db.prepare(
      `SELECT COALESCE(SUM(CASE WHEN operation = 'create' THEN 1 ELSE 0 END), 0) AS create_count,
              COALESCE(SUM(CASE WHEN operation = 'create' THEN byte_size ELSE 0 END), 0) AS create_bytes,
              COALESCE(SUM(CASE WHEN operation = 'create' THEN byte_size ELSE byte_size - COALESCE(old_size_bytes, 0) END), 0) AS active_bytes,
              COALESCE(SUM(CASE WHEN created_at >= ? AND created_at < ? THEN 1 ELSE 0 END), 0) AS today_count
       FROM image_upload_reservations WHERE household_id = ? AND status IN ('reserved', 'r2_written', 'cleanup_pending')`
    ).bind(dayStart, dayEnd, householdId).first<{ create_count: number; create_bytes: number; active_bytes: number; today_count: number }>();
    return { createCount: Number(row?.create_count ?? 0), createBytes: Number(row?.create_bytes ?? 0), activeBytes: Number(row?.active_bytes ?? 0), todayCount: Number(row?.today_count ?? 0) };
  }

  async reserveAtomically(input: ImageUploadReservation, limits: { activeCount: number; activeBytes: number; storedBytes: number; dailyUploads: number }, projected: { dayStart: string; dayEnd: string; priorReservedCount: number; priorReservedBytes: number; activeDelta: number }): Promise<boolean> {
    const update = this.db.prepare(
      `UPDATE household_image_usage SET reserved_count = reserved_count + 1, reserved_bytes = reserved_bytes + ?, updated_at = ?
       WHERE household_id = ?
         AND active_count + (SELECT COUNT(*) FROM image_upload_reservations WHERE household_id = ? AND operation = 'create' AND status IN ('reserved', 'r2_written', 'cleanup_pending')) + ? <= ?
         AND active_bytes + (SELECT COALESCE(SUM(CASE WHEN operation = 'create' THEN byte_size ELSE byte_size - COALESCE(old_size_bytes, 0) END), 0) FROM image_upload_reservations WHERE household_id = ? AND status IN ('reserved', 'r2_written', 'cleanup_pending')) + ? <= ?
         AND active_bytes + reserved_bytes + pending_cleanup_bytes + ? <= ?
         AND daily_upload_count + (SELECT COUNT(*) FROM image_upload_reservations WHERE household_id = ? AND created_at >= ? AND created_at < ? AND status IN ('reserved', 'r2_written', 'cleanup_pending')) < ?`
    ).bind(input.byteSize, input.updatedAt, input.householdId, input.householdId, input.operation === "create" ? 1 : 0, limits.activeCount, input.householdId, projected.activeDelta, limits.activeBytes, input.byteSize, limits.storedBytes, input.householdId, projected.dayStart, projected.dayEnd, limits.dailyUploads);
    const insert = this.db.prepare(
      `INSERT INTO image_upload_reservations (id, household_id, shopping_item_id, operation, status, r2_key, byte_size, old_image_id, old_r2_key, old_size_bytes, expires_at, created_at, updated_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM household_image_usage WHERE household_id = ? AND reserved_count = ? AND reserved_bytes = ?)`
    ).bind(input.id, input.householdId, input.shoppingItemId, input.operation, input.status, input.r2Key, input.byteSize, input.oldImageId, input.oldR2Key, input.oldSizeBytes, input.expiresAt, input.createdAt, input.updatedAt, input.householdId, projected.priorReservedCount + 1, projected.priorReservedBytes + input.byteSize);
    const results = await this.db.batch([update, insert]);
    return (results[0]?.meta.changes ?? 0) > 0 && (results[1]?.meta.changes ?? 0) > 0;
  }

  async releaseAtomically(id: string, householdId: string, byteSize: number, now: string): Promise<boolean> {
    const results = await this.db.batch([
      this.db.prepare("DELETE FROM image_upload_reservations WHERE id = ? AND household_id = ? AND status IN ('reserved', 'r2_written', 'cleanup_pending')").bind(id, householdId),
      this.db.prepare("UPDATE household_image_usage SET reserved_count = MAX(0, reserved_count - 1), reserved_bytes = MAX(0, reserved_bytes - ?), updated_at = ? WHERE household_id = ? AND reserved_count > 0 AND changes() > 0").bind(byteSize, now, householdId)
    ]);
    return (results[0]?.meta.changes ?? 0) > 0;
  }

  async finalizeAtomically(reservation: ImageUploadReservation, image: ShoppingItemImage, now: string): Promise<boolean> {
    const activeDelta = reservation.operation === "create" ? 1 : 0;
    const byteDelta = reservation.operation === "replace" ? image.sizeBytes - (reservation.oldSizeBytes ?? 0) : image.sizeBytes;
    const finalize = this.db.prepare(
      `UPDATE household_image_usage
       SET active_count = MAX(0, active_count + ?), active_bytes = MAX(0, active_bytes + ?),
           reserved_count = MAX(0, reserved_count - 1), reserved_bytes = MAX(0, reserved_bytes - ?),
           daily_upload_date = CASE WHEN daily_upload_date = ? THEN daily_upload_date ELSE ? END,
           daily_upload_count = CASE WHEN daily_upload_date = ? THEN daily_upload_count + 1 ELSE 1 END,
           updated_at = ?
       WHERE household_id = ? AND reserved_count > 0 AND reserved_bytes >= ?
         AND EXISTS (SELECT 1 FROM image_upload_reservations WHERE id = ? AND household_id = ? AND status IN ('reserved', 'r2_written', 'cleanup_pending'))`
    ).bind(activeDelta, byteDelta, reservation.byteSize, now.slice(0, 10), now.slice(0, 10), now.slice(0, 10), now, reservation.householdId, reservation.byteSize, reservation.id, reservation.householdId);
    const markFinalized = this.db.prepare("UPDATE image_upload_reservations SET status = 'finalized', updated_at = ? WHERE id = ? AND household_id = ? AND status IN ('reserved', 'r2_written', 'cleanup_pending') AND changes() > 0").bind(now, reservation.id, reservation.householdId);
    const upsert = this.db.prepare(
      `INSERT INTO shopping_item_images (id, shopping_item_id, household_id, r2_key, content_type, size_bytes, width, height, created_by, created_at, updated_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM image_upload_reservations WHERE id = ? AND status = 'finalized')
       ON CONFLICT(shopping_item_id) DO UPDATE SET id = excluded.id, household_id = excluded.household_id, r2_key = excluded.r2_key, content_type = excluded.content_type, size_bytes = excluded.size_bytes, width = excluded.width, height = excluded.height, created_by = excluded.created_by, updated_at = excluded.updated_at`
    ).bind(image.id, image.shoppingItemId, image.householdId, image.r2Key, image.contentType, image.sizeBytes, image.width, image.height, image.createdBy, image.createdAt, image.updatedAt, reservation.id);
    const remove = this.db.prepare("DELETE FROM image_upload_reservations WHERE id = ? AND household_id = ? AND status = 'finalized'").bind(reservation.id, reservation.householdId);
    const result = await this.db.batch([finalize, markFinalized, upsert, remove]);
    return (result[0]?.meta.changes ?? 0) > 0 && (result[1]?.meta.changes ?? 0) > 0 && (result[2]?.meta.changes ?? 0) > 0 && (result[3]?.meta.changes ?? 0) > 0;
  }
}
