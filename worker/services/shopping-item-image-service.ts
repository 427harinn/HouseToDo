import { nowIso } from "../lib/date";
import { AppError, shoppingItemNotFoundError, validationError } from "../lib/errors";
import { ShoppingItemImageRepository } from "../repositories/shopping-item-image-repository";
import { ShoppingItemRepository } from "../repositories/shopping-item-repository";
import type { ShoppingItemImage } from "../types/domain";
import { HouseholdService } from "./household-service";
import { OrphanR2ObjectRepository, type OrphanSourceType } from "../repositories/orphan-r2-object-repository";
import { ORPHAN_R2_RETENTION_DAYS } from "../lib/constants";
import { getImageLimits } from "../lib/image-limits";
import { ImageUploadReservationService } from "./image-upload-reservation-service";

export const MAX_IMAGE_BYTES = 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 1280;

export type ImageUploadInput = { body: ArrayBuffer; width: number; height: number };

const invalidImage = (message: string) => validationError({ image: message }, message);

export class ShoppingItemImageService {
  private readonly households: HouseholdService;
  private readonly items: ShoppingItemRepository;
  private readonly images: ShoppingItemImageRepository;
  private readonly orphanQueue: OrphanR2ObjectRepository;
  private readonly reservations: ImageUploadReservationService;

  constructor(private readonly db: D1Database, private readonly bucket: R2Bucket, env: Parameters<typeof getImageLimits>[0] = {}) {
    this.households = new HouseholdService(db);
    this.items = new ShoppingItemRepository(db);
    this.images = new ShoppingItemImageRepository(db);
    this.orphanQueue = new OrphanR2ObjectRepository(db);
    this.reservations = new ImageUploadReservationService(db, env);
  }

  private async deleteR2ObjectOrEnqueueCleanup(r2Key: string, input: { sourceType: OrphanSourceType; sourceId: string; householdId: string; byteSize?: number | null; reason: string }): Promise<void> {
    try { await this.bucket.delete(r2Key); }
    catch (error) {
      const now = new Date().toISOString();
      try { await this.orphanQueue.enqueue({ id: crypto.randomUUID(), r2Key, ...input, firstFailedAt: now, nextAttemptAt: new Date(new Date(now).getTime() + ORPHAN_R2_RETENTION_DAYS * 86400000).toISOString(), now }); }
      catch (queueError) { console.error(JSON.stringify({ event: "orphan_r2_queue_failed", sourceType: input.sourceType, sourceId: input.sourceId, errorCode: "QUEUE_UPDATE_FAILED", originalError: String(error instanceof Error ? error.message : error).slice(0, 500), queueError: String(queueError instanceof Error ? queueError.message : queueError).slice(0, 500) })); }
    }
  }

  async deleteKnownImage(image: ShoppingItemImage, sourceType: OrphanSourceType, reason: string): Promise<void> {
    await this.deleteR2ObjectOrEnqueueCleanup(image.r2Key, { sourceType, sourceId: image.shoppingItemId, householdId: image.householdId, byteSize: image.sizeBytes, reason });
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
    const image: ShoppingItemImage = { id, shoppingItemId: itemId, householdId: household.id, r2Key, contentType: "image/webp", sizeBytes: input.body.byteLength, width: input.width, height: input.height, createdBy: userId, createdAt: now, updatedAt: now };
    const reservation = await this.reservations.reserve({ householdId: household.id, shoppingItemId: itemId, r2Key, byteSize: input.body.byteLength, oldImage: old, now: new Date(now) });
    let r2Written = false;
    try {
      await this.bucket.put(reservation.r2Key, input.body, { httpMetadata: { contentType: "image/webp" } });
      r2Written = true;
      const confirmedOld = await this.images.findByItemForHousehold(household.id, itemId);
      if ((old?.id ?? null) !== (confirmedOld?.id ?? null) || (old?.updatedAt ?? null) !== (confirmedOld?.updatedAt ?? null)) {
        throw new AppError({ code: "CONFLICT", status: 409, message: "The image changed while the upload was in progress." });
      }
      const finalized = await this.reservations.finalize(reservation, image, now);
      if (!finalized) throw new AppError({ code: "CONFLICT", status: 409, message: "Image upload finalization could not be completed." });
    } catch (error) {
      if (r2Written) await this.deleteR2ObjectOrEnqueueCleanup(r2Key, { sourceType: "manual_reconciliation", sourceId: itemId, householdId: household.id, byteSize: input.body.byteLength, reason: "compensation after image upload failure" });
      await this.reservations.release(reservation);
      throw error;
    }
    if (old) await this.deleteKnownImage(old, "shopping_item_image_replace", "old image after replacement");
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
    await this.images.deleteForItem(household.id, itemId);
    await this.deleteKnownImage(image, "shopping_item_image_delete", "image metadata deleted");
  }

  async deleteForHouseholdItem(householdId: string, itemId: string): Promise<void> {
    const image = await this.images.findByItemForHousehold(householdId, itemId);
    if (!image) return;
    await this.images.deleteForItem(householdId, itemId);
    await this.deleteKnownImage(image, "shopping_item_delete", "shopping item deleted");
  }

  async deletePurchased(householdId: string): Promise<void> {
    for (const image of await this.images.listPurchasedByHousehold(householdId)) {
      await this.images.deleteForItem(householdId, image.shoppingItemId);
      await this.deleteKnownImage(image, "shopping_clear_purchased", "purchased shopping items cleared");
    }
  }
}
