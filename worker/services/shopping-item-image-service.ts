import { nowIso } from "../lib/date";
import { shoppingItemNotFoundError, validationError } from "../lib/errors";
import { ShoppingItemImageRepository } from "../repositories/shopping-item-image-repository";
import { ShoppingItemRepository } from "../repositories/shopping-item-repository";
import type { ShoppingItemImage } from "../types/domain";
import { HouseholdService } from "./household-service";

export const MAX_IMAGE_BYTES = 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 1280;

export type ImageUploadInput = { body: ArrayBuffer; width: number; height: number };

const invalidImage = (message: string) => validationError({ image: message }, message);

export class ShoppingItemImageService {
  private readonly households: HouseholdService;
  private readonly items: ShoppingItemRepository;
  private readonly images: ShoppingItemImageRepository;

  constructor(private readonly db: D1Database, private readonly bucket: R2Bucket) {
    this.households = new HouseholdService(db);
    this.items = new ShoppingItemRepository(db);
    this.images = new ShoppingItemImageRepository(db);
  }

  async listMetadata(userId: string): Promise<Map<string, ShoppingItemImage>> {
    const household = await this.households.requireCurrentHousehold(userId);
    return new Map((await this.images.listByHousehold(household.id)).map((image) => [image.shoppingItemId, image]));
  }

  async upload(userId: string, itemId: string, input: ImageUploadInput): Promise<ShoppingItemImage> {
    const household = await this.households.requireCurrentHousehold(userId);
    if (!(await this.items.findByIdForHousehold(household.id, itemId))) throw shoppingItemNotFoundError();
    if (!Number.isInteger(input.width) || input.width < 1 || input.width > MAX_IMAGE_DIMENSION || !Number.isInteger(input.height) || input.height < 1 || input.height > MAX_IMAGE_DIMENSION) {
      throw invalidImage("画像の幅と高さが不正です。");
    }
    if (input.body.byteLength < 16 || input.body.byteLength > MAX_IMAGE_BYTES) throw invalidImage("画像のサイズが上限を超えています。");
    const bytes = new Uint8Array(input.body);
    const riff = String.fromCharCode(...bytes.slice(0, 4));
    const webp = String.fromCharCode(...bytes.slice(8, 12));
    if (riff !== "RIFF" || webp !== "WEBP") throw invalidImage("WebP画像として確認できません。");

    const old = await this.images.findByItemForHousehold(household.id, itemId);
    const id = crypto.randomUUID();
    const r2Key = `households/${household.id}/shopping/${itemId}/${id}.webp`;
    const now = nowIso();
    await this.bucket.put(r2Key, input.body, { httpMetadata: { contentType: "image/webp" } });
    const image: ShoppingItemImage = { id, shoppingItemId: itemId, householdId: household.id, r2Key, contentType: "image/webp", sizeBytes: input.body.byteLength, width: input.width, height: input.height, createdBy: userId, createdAt: now, updatedAt: now };
    try {
      await this.images.upsert(image);
    } catch (error) {
      await this.bucket.delete(r2Key);
      throw error;
    }
    if (old) await this.bucket.delete(old.r2Key);
    return image;
  }

  async get(userId: string, itemId: string): Promise<{ image: ShoppingItemImage; object: R2ObjectBody }> {
    const household = await this.households.requireCurrentHousehold(userId);
    if (!(await this.items.findByIdForHousehold(household.id, itemId))) throw shoppingItemNotFoundError();
    const image = await this.images.findByItemForHousehold(household.id, itemId);
    if (!image) throw shoppingItemNotFoundError();
    const object = await this.bucket.get(image.r2Key);
    if (!object) throw shoppingItemNotFoundError();
    return { image, object };
  }

  async delete(userId: string, itemId: string): Promise<void> {
    const household = await this.households.requireCurrentHousehold(userId);
    if (!(await this.items.findByIdForHousehold(household.id, itemId))) throw shoppingItemNotFoundError();
    const image = await this.images.findByItemForHousehold(household.id, itemId);
    if (!image) return;
    await this.bucket.delete(image.r2Key);
    await this.images.deleteForItem(household.id, itemId);
  }

  async deleteForHouseholdItem(householdId: string, itemId: string): Promise<void> {
    const image = await this.images.findByItemForHousehold(householdId, itemId);
    if (!image) return;
    await this.bucket.delete(image.r2Key);
    await this.images.deleteForItem(householdId, itemId);
  }

  async deletePurchased(householdId: string): Promise<void> {
    for (const image of await this.images.listPurchasedByHousehold(householdId)) {
      await this.bucket.delete(image.r2Key);
      await this.images.deleteForItem(householdId, image.shoppingItemId);
    }
  }
}
