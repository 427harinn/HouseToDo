import { conflictError } from "../lib/errors";

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

  async listExpiredReservations(now: string): Promise<ImageUploadReservation[]> {
    const result = await this.db.prepare(
      `SELECT * FROM image_upload_reservations
       WHERE status IN ('reserved', 'r2_written', 'cleanup_pending') AND expires_at <= ?
       ORDER BY expires_at ASC`
    ).bind(now).all<Row>();
    return (result.results ?? []).map((row) => map(row)!);
  }

  async deleteExpiredReservation(id: string, now: string): Promise<boolean> {
    const result = await this.db.prepare(
      `DELETE FROM image_upload_reservations
       WHERE id = ? AND status IN ('reserved', 'r2_written', 'cleanup_pending') AND expires_at <= ?`
    ).bind(id, now).run();
    return (result.meta.changes ?? 0) > 0;
  }
}
