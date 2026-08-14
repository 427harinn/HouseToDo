import {
  inactiveShoppingTemplateError,
  shoppingItemNotFoundError,
  shoppingTemplateNotFoundError
} from "../lib/errors";
import type { ShoppingUpdateInput, ShoppingWriteInput } from "../lib/validation";
import { ShoppingItemRepository } from "../repositories/shopping-item-repository";
import { ShoppingItemImageRepository } from "../repositories/shopping-item-image-repository";
import { ShoppingTemplateRepository } from "../repositories/shopping-template-repository";
import type { ShoppingItem, ShoppingRecentItem } from "../types/domain";
import { HouseholdService } from "./household-service";
import { ShoppingItemImageService } from "./shopping-item-image-service";
import { nowIso } from "../lib/date";

export class ShoppingService {
  private readonly households: HouseholdService;
  private readonly items: ShoppingItemRepository;
  private readonly templates: ShoppingTemplateRepository;
  private readonly imageRepository: ShoppingItemImageRepository;
  private readonly imageService?: ShoppingItemImageService;

  constructor(db: D1Database, attachments?: R2Bucket) {
    this.households = new HouseholdService(db);
    this.items = new ShoppingItemRepository(db);
    this.templates = new ShoppingTemplateRepository(db);
    this.imageRepository = new ShoppingItemImageRepository(db);
    if (attachments) this.imageService = new ShoppingItemImageService(db, attachments);
  }

  async listItems(userId: string): Promise<{ pending: ShoppingItem[]; purchased: ShoppingItem[] }> {
    const household = await this.households.requireCurrentHousehold(userId);
    const items = await this.items.listByHouseholdId(household.id, { includePurchased: true });
    const images = await this.imageRepository.listByHousehold(household.id);
    const imageMap = new Map(images.map((image) => [image.shoppingItemId, image]));
    for (const item of items) {
      const image = imageMap.get(item.id);
      item.image = image ? { available: true, width: image.width, height: image.height, size: image.sizeBytes, updatedAt: image.updatedAt } : null;
    }
    return {
      pending: items.filter((item) => item.status === "pending"),
      purchased: items.filter((item) => item.status === "purchased")
    };
  }

  async listRecentItems(userId: string, limit = 8): Promise<ShoppingRecentItem[]> {
    const household = await this.households.requireCurrentHousehold(userId);
    const items = await this.items.listRecentByHouseholdId(household.id, Math.min(Math.max(limit, 1), 8));
    return items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      note: item.note,
      createdAt: item.createdAt
    }));
  }

  async getItem(userId: string, itemId: string): Promise<ShoppingItem> {
    const household = await this.households.requireCurrentHousehold(userId);
    const item = await this.items.findByIdForHousehold(household.id, itemId);
    if (!item) throw shoppingItemNotFoundError();
    const image = await this.imageRepository.findByItemForHousehold(household.id, itemId);
    item.image = image ? { available: true, width: image.width, height: image.height, size: image.sizeBytes, updatedAt: image.updatedAt } : null;
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
    const image = await this.imageRepository.findByItemForHousehold(household.id, itemId);
    updated.image = image ? { available: true, width: image.width, height: image.height, size: image.sizeBytes, updatedAt: image.updatedAt } : null;
    return updated;
  }

  async deleteItem(userId: string, itemId: string): Promise<void> {
    const household = await this.households.requireCurrentHousehold(userId);
    const image = await this.imageRepository.findByItemForHousehold(household.id, itemId);
    const deleted = image
      ? await this.items.deleteOrDeactivateWithImage(household.id, itemId, image, nowIso())
      : await this.items.deleteOrDeactivate(household.id, itemId);
    if (!deleted) throw shoppingItemNotFoundError();
    if (image && this.imageService) await this.imageService.deleteKnownImage(image, "shopping_item_delete", "shopping item deleted");
  }

  async markPurchased(userId: string, itemId: string): Promise<ShoppingItem> {
    const household = await this.households.requireCurrentHousehold(userId);
    const existing = await this.items.findByIdForHousehold(household.id, itemId);
    if (!existing) throw shoppingItemNotFoundError();
    if (existing.status === "purchased") return existing;
    const updated = await this.items.markPurchased(household.id, itemId, userId, nowIso());
    if (!updated) throw shoppingItemNotFoundError();
    const image = await this.imageRepository.findByItemForHousehold(household.id, itemId);
    updated.image = image ? { available: true, width: image.width, height: image.height, size: image.sizeBytes, updatedAt: image.updatedAt } : null;
    return updated;
  }

  async markPending(userId: string, itemId: string): Promise<ShoppingItem> {
    const household = await this.households.requireCurrentHousehold(userId);
    const existing = await this.items.findByIdForHousehold(household.id, itemId);
    if (!existing) throw shoppingItemNotFoundError();
    if (existing.status === "pending") return existing;
    const updated = await this.items.markPending(household.id, itemId, nowIso());
    if (!updated) throw shoppingItemNotFoundError();
    const image = await this.imageRepository.findByItemForHousehold(household.id, itemId);
    updated.image = image ? { available: true, width: image.width, height: image.height, size: image.sizeBytes, updatedAt: image.updatedAt } : null;
    return updated;
  }

  async clearPurchased(userId: string): Promise<number> {
    const household = await this.households.requireCurrentHousehold(userId);
    const images = await this.imageRepository.listPurchasedByHousehold(household.id);
    const cleared = await this.items.clearPurchasedWithImages(household.id, images, nowIso());
    if (this.imageService) for (const image of images) await this.imageService.deleteKnownImage(image, "shopping_clear_purchased", "purchased shopping items cleared");
    return cleared;
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
