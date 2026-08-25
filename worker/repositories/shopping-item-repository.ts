import type { ShoppingItem, ShoppingItemImage, ShoppingItemStatus } from "../types/domain";

type ShoppingItemRow = {
  id: string;
  household_id: string;
  name: string;
  quantity: string | null;
  note: string | null;
  planned_purchase_date: string | null;
  status: ShoppingItemStatus;
  added_by: string;
  purchased_by: string | null;
  purchased_by_display_name: string | null;
  purchased_at: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type CreateShoppingItemInput = {
  id: string;
  householdId: string;
  name: string;
  quantity: string | null;
  note: string | null;
  plannedPurchaseDate: string | null;
  addedBy: string;
  sortOrder: number;
  now: string;
};

export type UpdateShoppingItemInput = {
  name?: string;
  quantity?: string | null;
  note?: string | null;
  plannedPurchaseDate?: string | null;
  now: string;
};

const selectItem = `si.id, si.household_id, si.name, si.quantity, si.note, si.planned_purchase_date, si.status,
  si.added_by, si.purchased_by, u.display_name AS purchased_by_display_name,
  si.purchased_at, si.sort_order, si.created_at, si.updated_at`;

const toItem = (row: ShoppingItemRow | null): ShoppingItem | null =>
  row
    ? {
        id: row.id,
        householdId: row.household_id,
        name: row.name,
        quantity: row.quantity,
        note: row.note,
        plannedPurchaseDate: row.planned_purchase_date,
        status: row.status,
        addedBy: row.added_by,
        purchasedBy: row.purchased_by,
        purchasedByDisplayName: row.purchased_by_display_name,
        purchasedAt: row.purchased_at,
        sortOrder: row.sort_order,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        image: null
      }
    : null;

export class ShoppingItemRepository {
  constructor(private readonly db: D1Database) {}

  async listByHouseholdId(
    householdId: string,
    options: { includePurchased?: boolean } = {}
  ): Promise<ShoppingItem[]> {
    const result = await this.db
      .prepare(
        `SELECT ${selectItem}
         FROM shopping_items si
         LEFT JOIN users u ON u.id = si.purchased_by
         WHERE si.household_id = ? ${options.includePurchased ? "" : "AND si.status = 'pending'"}
         ORDER BY
           CASE WHEN si.status = 'pending' THEN 0 ELSE 1 END ASC,
           CASE WHEN si.status = 'pending' THEN si.sort_order END ASC,
           CASE WHEN si.status = 'pending' THEN si.created_at END ASC,
           CASE WHEN si.status = 'purchased' THEN si.purchased_at END DESC`
      )
      .bind(householdId)
      .all<ShoppingItemRow>();
    return (result.results ?? []).map((row) => toItem(row)!);
  }

  async listPendingPreview(householdId: string, limit: number): Promise<ShoppingItem[]> {
    const result = await this.db
      .prepare(
        `SELECT ${selectItem}
         FROM shopping_items si
         LEFT JOIN users u ON u.id = si.purchased_by
         WHERE si.household_id = ? AND si.status = 'pending'
         ORDER BY si.sort_order ASC, si.created_at ASC
         LIMIT ?`
      )
      .bind(householdId, limit)
      .all<ShoppingItemRow>();
    return (result.results ?? []).map((row) => toItem(row)!);
  }

  async listRecentByHouseholdId(householdId: string, limit: number): Promise<ShoppingItem[]> {
    const result = await this.db
      .prepare(
        `SELECT ${selectItem}
         FROM shopping_items si
         LEFT JOIN users u ON u.id = si.purchased_by
         WHERE si.household_id = ?
           AND NOT EXISTS (
             SELECT 1
             FROM shopping_items newer
             WHERE newer.household_id = si.household_id
               AND lower(trim(newer.name)) = lower(trim(si.name))
               AND (
                 newer.created_at > si.created_at
                 OR (newer.created_at = si.created_at AND newer.id > si.id)
               )
           )
         ORDER BY si.created_at DESC, si.id DESC
         LIMIT ?`
      )
      .bind(householdId, limit)
      .all<ShoppingItemRow>();
    return (result.results ?? []).map((row) => toItem(row)!);
  }

  async listPlannedByHouseholdId(householdId: string, from: string, to: string): Promise<ShoppingItem[]> {
    const result = await this.db
      .prepare(
        `SELECT ${selectItem}
         FROM shopping_items si
         LEFT JOIN users u ON u.id = si.purchased_by
         WHERE si.household_id = ?
           AND si.status = 'pending'
           AND si.planned_purchase_date >= ?
           AND si.planned_purchase_date <= ?
         ORDER BY si.planned_purchase_date ASC, si.sort_order ASC, si.created_at ASC`
      )
      .bind(householdId, from, to)
      .all<ShoppingItemRow>();
    return (result.results ?? []).map((row) => toItem(row)!);
  }

  async listUnplannedByHouseholdId(householdId: string): Promise<ShoppingItem[]> {
    const result = await this.db
      .prepare(
        `SELECT ${selectItem}
         FROM shopping_items si
         LEFT JOIN users u ON u.id = si.purchased_by
         WHERE si.household_id = ?
           AND si.planned_purchase_date IS NULL
         ORDER BY
           CASE WHEN si.status = 'pending' THEN 0 ELSE 1 END ASC,
           CASE WHEN si.status = 'pending' THEN si.sort_order END ASC,
           CASE WHEN si.status = 'pending' THEN si.created_at END ASC,
           CASE WHEN si.status = 'purchased' THEN si.purchased_at END DESC`
      )
      .bind(householdId)
      .all<ShoppingItemRow>();
    return (result.results ?? []).map((row) => toItem(row)!);
  }

  async countPending(householdId: string): Promise<number> {
    const row = await this.db
      .prepare("SELECT COUNT(*) AS count FROM shopping_items WHERE household_id = ? AND status = 'pending'")
      .bind(householdId)
      .first<{ count: number }>();
    return Number(row?.count ?? 0);
  }

  async findByIdForHousehold(householdId: string, itemId: string): Promise<ShoppingItem | null> {
    const row = await this.db
      .prepare(
        `SELECT ${selectItem}
         FROM shopping_items si
         LEFT JOIN users u ON u.id = si.purchased_by
         WHERE si.household_id = ? AND si.id = ?`
      )
      .bind(householdId, itemId)
      .first<ShoppingItemRow>();
    return toItem(row);
  }

  async getNextSortOrder(householdId: string): Promise<number> {
    const row = await this.db
      .prepare("SELECT COALESCE(MAX(sort_order), 0) AS max_sort_order FROM shopping_items WHERE household_id = ?")
      .bind(householdId)
      .first<{ max_sort_order: number }>();
    return Number(row?.max_sort_order ?? 0) + 1;
  }

  async reorderPending(householdId: string, itemIds: string[], now: string): Promise<ShoppingItem[]> {
    const pending = (await this.listByHouseholdId(householdId)).filter((item) => item.status === "pending");
    const pendingIds = pending.map((item) => item.id);
    if (pendingIds.length !== itemIds.length || pendingIds.some((id) => !itemIds.includes(id))) return [];
    await this.db.batch(itemIds.map((itemId, index) =>
      this.db.prepare(
        "UPDATE shopping_items SET sort_order = ?, updated_at = ? WHERE household_id = ? AND id = ? AND status = 'pending'"
      ).bind(index + 1, now, householdId, itemId)
    ));
    return this.listByHouseholdId(householdId);
  }

  async create(input: CreateShoppingItemInput): Promise<ShoppingItem> {
    await this.db
      .prepare(
        `INSERT INTO shopping_items (
          id, household_id, name, quantity, note, planned_purchase_date, status, added_by, purchased_by,
          purchased_at, sort_order, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, NULL, NULL, ?, ?, ?)`
      )
      .bind(
        input.id,
        input.householdId,
        input.name,
        input.quantity,
        input.note,
        input.plannedPurchaseDate,
        input.addedBy,
        input.sortOrder,
        input.now,
        input.now
      )
      .run();
    return (await this.findByIdForHousehold(input.householdId, input.id))!;
  }

  async update(
    householdId: string,
    itemId: string,
    input: UpdateShoppingItemInput
  ): Promise<ShoppingItem | null> {
    const current = await this.findByIdForHousehold(householdId, itemId);
    if (!current) return null;
    await this.db
      .prepare(
        `UPDATE shopping_items
         SET name = ?, quantity = ?, note = ?, planned_purchase_date = ?, updated_at = ?
         WHERE household_id = ? AND id = ?`
      )
      .bind(
        input.name ?? current.name,
        "quantity" in input ? input.quantity ?? null : current.quantity,
        "note" in input ? input.note ?? null : current.note,
        "plannedPurchaseDate" in input ? input.plannedPurchaseDate ?? null : current.plannedPurchaseDate,
        input.now,
        householdId,
        itemId
      )
      .run();
    return this.findByIdForHousehold(householdId, itemId);
  }

  async markPurchased(
    householdId: string,
    itemId: string,
    userId: string,
    purchasedAt: string
  ): Promise<ShoppingItem | null> {
    await this.db
      .prepare(
        `UPDATE shopping_items
         SET status = 'purchased', purchased_by = ?, purchased_at = ?, updated_at = ?
         WHERE household_id = ? AND id = ? AND status = 'pending'`
      )
      .bind(userId, purchasedAt, purchasedAt, householdId, itemId)
      .run();
    return this.findByIdForHousehold(householdId, itemId);
  }

  async markPending(householdId: string, itemId: string, updatedAt: string): Promise<ShoppingItem | null> {
    await this.db
      .prepare(
        `UPDATE shopping_items
         SET status = 'pending', purchased_by = NULL, purchased_at = NULL, updated_at = ?
         WHERE household_id = ? AND id = ?`
      )
      .bind(updatedAt, householdId, itemId)
      .run();
    return this.findByIdForHousehold(householdId, itemId);
  }

  async deleteOrDeactivate(householdId: string, itemId: string): Promise<boolean> {
    const result = await this.db
      .prepare("DELETE FROM shopping_items WHERE household_id = ? AND id = ?")
      .bind(householdId, itemId)
      .run();
    return (result.meta.changes ?? 0) > 0;
  }

  async deleteOrDeactivateWithImage(householdId: string, itemId: string, image: ShoppingItemImage, now: string): Promise<boolean> {
    const result = await this.db.batch([
      this.db.prepare(
        `INSERT INTO household_image_usage (household_id, updated_at) VALUES (?, ?)
         ON CONFLICT(household_id) DO NOTHING`
      ).bind(householdId, now),
      this.db.prepare(
        `DELETE FROM shopping_items
         WHERE household_id = ? AND id = ? AND EXISTS (
           SELECT 1 FROM shopping_item_images
           WHERE household_id = ? AND shopping_item_id = ? AND id = ? AND size_bytes = ?
         )`
      ).bind(householdId, itemId, householdId, itemId, image.id, image.sizeBytes),
      this.db.prepare(
        `UPDATE household_image_usage
         SET active_count = MAX(0, active_count - 1),
             active_bytes = MAX(0, active_bytes - ?),
             updated_at = ?
         WHERE household_id = ? AND changes() > 0`
      ).bind(image.sizeBytes, now, householdId)
    ]);
    return (result[1]?.meta.changes ?? 0) > 0;
  }

  async clearPurchased(householdId: string): Promise<number> {
    const result = await this.db
      .prepare("DELETE FROM shopping_items WHERE household_id = ? AND status = 'purchased'")
      .bind(householdId)
      .run();
    return result.meta.changes ?? 0;
  }

  async clearPurchasedWithImages(householdId: string, images: ShoppingItemImage[], now: string): Promise<number> {
    if (images.length === 0) return this.clearPurchased(householdId);
    const statements: D1PreparedStatement[] = [
      this.db.prepare(
        `INSERT INTO household_image_usage (household_id, updated_at) VALUES (?, ?)
         ON CONFLICT(household_id) DO NOTHING`
      ).bind(householdId, now)
    ];
    for (const image of images) {
      statements.push(
        this.db.prepare(
          `DELETE FROM shopping_items
           WHERE household_id = ? AND id = ? AND status = 'purchased' AND EXISTS (
             SELECT 1 FROM shopping_item_images
             WHERE household_id = ? AND shopping_item_id = ? AND id = ? AND size_bytes = ?
           )`
        ).bind(householdId, image.shoppingItemId, householdId, image.shoppingItemId, image.id, image.sizeBytes),
        this.db.prepare(
          `UPDATE household_image_usage
           SET active_count = MAX(0, active_count - 1),
               active_bytes = MAX(0, active_bytes - ?),
               updated_at = ?
           WHERE household_id = ? AND changes() > 0`
        ).bind(image.sizeBytes, now, householdId)
      );
    }
    statements.push(
      this.db.prepare(
        `DELETE FROM shopping_items
         WHERE household_id = ? AND status = 'purchased'
           AND NOT EXISTS (
             SELECT 1 FROM shopping_item_images
             WHERE household_id = ? AND shopping_item_id = shopping_items.id
           )`
      ).bind(householdId, householdId)
    );
    const result = await this.db.batch(statements);
    let deleted = 0;
    for (let index = 1; index < result.length - 1; index += 2) deleted += result[index]?.meta.changes ?? 0;
    deleted += result[statements.length - 1]?.meta.changes ?? 0;
    return deleted;
  }
}
