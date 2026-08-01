import { nowIso } from "../lib/date";
import {
  inactiveShoppingTemplateError,
  shoppingItemNotFoundError,
  shoppingTemplateNotFoundError
} from "../lib/errors";
import type { ShoppingUpdateInput, ShoppingWriteInput } from "../lib/validation";
import { ShoppingItemRepository } from "../repositories/shopping-item-repository";
import { ShoppingTemplateRepository } from "../repositories/shopping-template-repository";
import type { ShoppingItem } from "../types/domain";
import { HouseholdService } from "./household-service";

export class ShoppingService {
  private readonly households: HouseholdService;
  private readonly items: ShoppingItemRepository;
  private readonly templates: ShoppingTemplateRepository;

  constructor(db: D1Database) {
    this.households = new HouseholdService(db);
    this.items = new ShoppingItemRepository(db);
    this.templates = new ShoppingTemplateRepository(db);
  }

  async listItems(userId: string): Promise<{ pending: ShoppingItem[]; purchased: ShoppingItem[] }> {
    const household = await this.households.requireCurrentHousehold(userId);
    const items = await this.items.listByHouseholdId(household.id, { includePurchased: true });
    return {
      pending: items.filter((item) => item.status === "pending"),
      purchased: items.filter((item) => item.status === "purchased")
    };
  }

  async getItem(userId: string, itemId: string): Promise<ShoppingItem> {
    const household = await this.households.requireCurrentHousehold(userId);
    const item = await this.items.findByIdForHousehold(household.id, itemId);
    if (!item) throw shoppingItemNotFoundError();
    return item;
  }

  async createItem(userId: string, input: ShoppingWriteInput): Promise<ShoppingItem> {
    const household = await this.households.requireCurrentHousehold(userId);
    const now = nowIso();
    return this.items.create({
      id: crypto.randomUUID(),
      householdId: household.id,
      ...input,
      addedBy: userId,
      sortOrder: await this.items.getNextSortOrder(household.id),
      now
    });
  }

  async updateItem(userId: string, itemId: string, input: ShoppingUpdateInput): Promise<ShoppingItem> {
    const household = await this.households.requireCurrentHousehold(userId);
    const updated = await this.items.update(household.id, itemId, { ...input, now: nowIso() });
    if (!updated) throw shoppingItemNotFoundError();
    return updated;
  }

  async deleteItem(userId: string, itemId: string): Promise<void> {
    const household = await this.households.requireCurrentHousehold(userId);
    const deleted = await this.items.deleteOrDeactivate(household.id, itemId);
    if (!deleted) throw shoppingItemNotFoundError();
  }

  async markPurchased(userId: string, itemId: string): Promise<ShoppingItem> {
    const household = await this.households.requireCurrentHousehold(userId);
    const existing = await this.items.findByIdForHousehold(household.id, itemId);
    if (!existing) throw shoppingItemNotFoundError();
    if (existing.status === "purchased") return existing;
    const updated = await this.items.markPurchased(household.id, itemId, userId, nowIso());
    if (!updated) throw shoppingItemNotFoundError();
    return updated;
  }

  async markPending(userId: string, itemId: string): Promise<ShoppingItem> {
    const household = await this.households.requireCurrentHousehold(userId);
    const existing = await this.items.findByIdForHousehold(household.id, itemId);
    if (!existing) throw shoppingItemNotFoundError();
    if (existing.status === "pending") return existing;
    const updated = await this.items.markPending(household.id, itemId, nowIso());
    if (!updated) throw shoppingItemNotFoundError();
    return updated;
  }

  async clearPurchased(userId: string): Promise<number> {
    const household = await this.households.requireCurrentHousehold(userId);
    return this.items.clearPurchased(household.id);
  }

  async addFromTemplate(userId: string, templateId: string): Promise<ShoppingItem> {
    const household = await this.households.requireCurrentHousehold(userId);
    const template = await this.templates.findByIdForHousehold(household.id, templateId);
    if (!template) throw shoppingTemplateNotFoundError();
    if (!template.active) throw inactiveShoppingTemplateError();
    return this.createItem(userId, {
      name: template.name,
      quantity: template.quantity,
      note: template.note
    });
  }
}
