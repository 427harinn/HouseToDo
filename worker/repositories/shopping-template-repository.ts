import type { ShoppingTemplate } from "../types/domain";

type ShoppingTemplateRow = {
  id: string;
  household_id: string;
  name: string;
  quantity: string | null;
  note: string | null;
  active: number;
  sort_order: number;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type CreateShoppingTemplateInput = {
  id: string;
  householdId: string;
  name: string;
  quantity: string | null;
  note: string | null;
  sortOrder: number;
  createdBy: string;
  now: string;
};

export type UpdateShoppingTemplateInput = {
  name?: string;
  quantity?: string | null;
  note?: string | null;
  now: string;
};

const toTemplate = (row: ShoppingTemplateRow | null): ShoppingTemplate | null =>
  row
    ? {
        id: row.id,
        householdId: row.household_id,
        name: row.name,
        quantity: row.quantity,
        note: row.note,
        active: row.active === 1,
        sortOrder: row.sort_order,
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }
    : null;

export class ShoppingTemplateRepository {
  constructor(private readonly db: D1Database) {}

  async listByHouseholdId(
    householdId: string,
    options: { includeInactive?: boolean } = {}
  ): Promise<ShoppingTemplate[]> {
    const result = await this.db
      .prepare(
        `SELECT id, household_id, name, quantity, note, active, sort_order, created_by, created_at, updated_at
         FROM shopping_templates
         WHERE household_id = ? ${options.includeInactive ? "" : "AND active = 1"}
         ORDER BY sort_order ASC, name ASC`
      )
      .bind(householdId)
      .all<ShoppingTemplateRow>();
    return (result.results ?? []).map((row) => toTemplate(row)!);
  }

  async findByIdForHousehold(householdId: string, templateId: string): Promise<ShoppingTemplate | null> {
    const row = await this.db
      .prepare(
        `SELECT id, household_id, name, quantity, note, active, sort_order, created_by, created_at, updated_at
         FROM shopping_templates
         WHERE household_id = ? AND id = ?`
      )
      .bind(householdId, templateId)
      .first<ShoppingTemplateRow>();
    return toTemplate(row);
  }

  async getNextSortOrder(householdId: string): Promise<number> {
    const row = await this.db
      .prepare(
        "SELECT COALESCE(MAX(sort_order), 0) AS max_sort_order FROM shopping_templates WHERE household_id = ?"
      )
      .bind(householdId)
      .first<{ max_sort_order: number }>();
    return Number(row?.max_sort_order ?? 0) + 1;
  }

  async create(input: CreateShoppingTemplateInput): Promise<ShoppingTemplate> {
    await this.db
      .prepare(
        `INSERT INTO shopping_templates (
          id, household_id, name, quantity, note, active, sort_order, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`
      )
      .bind(
        input.id,
        input.householdId,
        input.name,
        input.quantity,
        input.note,
        input.sortOrder,
        input.createdBy,
        input.now,
        input.now
      )
      .run();
    return (await this.findByIdForHousehold(input.householdId, input.id))!;
  }

  async update(
    householdId: string,
    templateId: string,
    input: UpdateShoppingTemplateInput
  ): Promise<ShoppingTemplate | null> {
    const current = await this.findByIdForHousehold(householdId, templateId);
    if (!current) return null;
    await this.db
      .prepare(
        `UPDATE shopping_templates
         SET name = ?, quantity = ?, note = ?, updated_at = ?
         WHERE household_id = ? AND id = ?`
      )
      .bind(
        input.name ?? current.name,
        "quantity" in input ? input.quantity ?? null : current.quantity,
        "note" in input ? input.note ?? null : current.note,
        input.now,
        householdId,
        templateId
      )
      .run();
    return this.findByIdForHousehold(householdId, templateId);
  }

  async deactivate(householdId: string, templateId: string, updatedAt: string): Promise<boolean> {
    const result = await this.db
      .prepare("UPDATE shopping_templates SET active = 0, updated_at = ? WHERE household_id = ? AND id = ?")
      .bind(updatedAt, householdId, templateId)
      .run();
    return (result.meta.changes ?? 0) > 0;
  }
}
