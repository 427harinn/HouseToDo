import type { ShoppingItemImage } from "../types/domain";

type ImageRow = {
  id: string;
  shopping_item_id: string;
  household_id: string;
  r2_key: string;
  content_type: "image/webp";
  size_bytes: number;
  width: number;
  height: number;
  created_by: string;
  created_at: string;
  updated_at: string;
};

const toImage = (row: ImageRow | null): ShoppingItemImage | null => row ? {
  id: row.id,
  shoppingItemId: row.shopping_item_id,
  householdId: row.household_id,
  r2Key: row.r2_key,
  contentType: row.content_type,
  sizeBytes: row.size_bytes,
  width: row.width,
  height: row.height,
  createdBy: row.created_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at
} : null;

export class ShoppingItemImageRepository {
  constructor(private readonly db: D1Database) {}

  async findByItemForHousehold(householdId: string, itemId: string): Promise<ShoppingItemImage | null> {
    const row = await this.db.prepare(
      "SELECT id, shopping_item_id, household_id, r2_key, content_type, size_bytes, width, height, created_by, created_at, updated_at FROM shopping_item_images WHERE household_id = ? AND shopping_item_id = ?"
    ).bind(householdId, itemId).first<ImageRow>();
    return toImage(row);
  }

  async listByHousehold(householdId: string): Promise<ShoppingItemImage[]> {
    const result = await this.db.prepare(
      "SELECT id, shopping_item_id, household_id, r2_key, content_type, size_bytes, width, height, created_by, created_at, updated_at FROM shopping_item_images WHERE household_id = ?"
    ).bind(householdId).all<ImageRow>();
    return (result.results ?? []).map((row) => toImage(row)!);
  }

  async listPurchasedByHousehold(householdId: string): Promise<ShoppingItemImage[]> {
    const result = await this.db.prepare(
      "SELECT sii.id, sii.shopping_item_id, sii.household_id, sii.r2_key, sii.content_type, sii.size_bytes, sii.width, sii.height, sii.created_by, sii.created_at, sii.updated_at FROM shopping_item_images sii INNER JOIN shopping_items si ON si.id = sii.shopping_item_id WHERE sii.household_id = ? AND si.status = 'purchased'"
    ).bind(householdId).all<ImageRow>();
    return (result.results ?? []).map((row) => toImage(row)!);
  }

  async upsert(input: ShoppingItemImage): Promise<void> {
    await this.db.prepare(
      `INSERT INTO shopping_item_images (id, shopping_item_id, household_id, r2_key, content_type, size_bytes, width, height, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(shopping_item_id) DO UPDATE SET id = excluded.id, household_id = excluded.household_id, r2_key = excluded.r2_key, content_type = excluded.content_type, size_bytes = excluded.size_bytes, width = excluded.width, height = excluded.height, created_by = excluded.created_by, updated_at = excluded.updated_at`
    ).bind(input.id, input.shoppingItemId, input.householdId, input.r2Key, input.contentType, input.sizeBytes, input.width, input.height, input.createdBy, input.createdAt, input.updatedAt).run();
  }

  prepareUpsert(input: ShoppingItemImage): D1PreparedStatement {
    return this.db.prepare(
      `INSERT INTO shopping_item_images (id, shopping_item_id, household_id, r2_key, content_type, size_bytes, width, height, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(shopping_item_id) DO UPDATE SET id = excluded.id, household_id = excluded.household_id, r2_key = excluded.r2_key, content_type = excluded.content_type, size_bytes = excluded.size_bytes, width = excluded.width, height = excluded.height, created_by = excluded.created_by, updated_at = excluded.updated_at`
    ).bind(input.id, input.shoppingItemId, input.householdId, input.r2Key, input.contentType, input.sizeBytes, input.width, input.height, input.createdBy, input.createdAt, input.updatedAt);
  }

  async deleteForItem(householdId: string, itemId: string): Promise<void> {
    await this.db.prepare("DELETE FROM shopping_item_images WHERE household_id = ? AND shopping_item_id = ?").bind(householdId, itemId).run();
  }

  async existsByR2Key(r2Key: string): Promise<boolean> {
    return (await this.db.prepare("SELECT id FROM shopping_item_images WHERE r2_key = ?").bind(r2Key).first<{ id: string }>()) !== null;
  }
}
