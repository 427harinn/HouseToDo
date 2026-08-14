import { apiRequest } from "./client";
import type { ProcessedImage } from "../lib/image-processing";

export type ShoppingItemStatus = "pending" | "purchased";
export type ShoppingItemImage = { available: true; width: number; height: number; size: number; updatedAt: string };

export type ShoppingItem = {
  id: string;
  name: string;
  quantity: string | null;
  note: string | null;
  status: ShoppingItemStatus;
  addedBy: string;
  purchasedBy: { userId: string; displayName: string | null } | null;
  purchasedAt: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  image: ShoppingItemImage | null;
};

export type ShoppingTemplate = {
  id: string;
  name: string;
  quantity: string | null;
  note: string | null;
  active: boolean;
  sortOrder: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type ShoppingWriteInput = {
  name: string;
  quantity?: string | null;
  note?: string | null;
};

export type ShoppingItemList = {
  pending: ShoppingItem[];
  purchased: ShoppingItem[];
};

export type ShoppingRecentItem = {
  name: string;
  quantity: string | null;
  note: string | null;
  createdAt: string;
};

export type CreateShoppingItemInput = ShoppingWriteInput;
export type UpdateShoppingItemInput = ShoppingUpdateInput;
export type CreateShoppingTemplateInput = ShoppingWriteInput;
export type UpdateShoppingTemplateInput = ShoppingUpdateInput;

export type ShoppingUpdateInput = {
  name?: string;
  quantity?: string | null;
  note?: string | null;
};

export const listShoppingItems = (signal?: AbortSignal) =>
  apiRequest<ShoppingItemList>("/api/shopping/items", { signal });

export const listRecentShoppingItems = (limit = 8, signal?: AbortSignal) =>
  apiRequest<{ items: ShoppingRecentItem[] }>(`/api/shopping/recent?limit=${limit}`, { signal });

export const getShoppingItem = (itemId: string, signal?: AbortSignal) =>
  apiRequest<{ item: ShoppingItem }>(`/api/shopping/items/${itemId}`, { signal });

export const createShoppingItem = (input: CreateShoppingItemInput, signal?: AbortSignal) =>
  apiRequest<{ item: ShoppingItem }>("/api/shopping/items", {
    method: "POST",
    body: JSON.stringify(input),
    signal
  });

export const updateShoppingItem = (itemId: string, input: UpdateShoppingItemInput, signal?: AbortSignal) =>
  apiRequest<{ item: ShoppingItem }>(`/api/shopping/items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
    signal
  });

export const purchaseShoppingItem = (itemId: string, signal?: AbortSignal) =>
  apiRequest<{ item: ShoppingItem }>(`/api/shopping/items/${itemId}/purchase`, {
    method: "POST",
    body: JSON.stringify({}),
    signal
  });

export const unpurchaseShoppingItem = (itemId: string, signal?: AbortSignal) =>
  apiRequest<{ item: ShoppingItem }>(`/api/shopping/items/${itemId}/unpurchase`, {
    method: "POST",
    body: JSON.stringify({}),
    signal
  });

export const deleteShoppingItem = (itemId: string, signal?: AbortSignal) =>
  apiRequest<{ deleted: true }>(`/api/shopping/items/${itemId}`, {
    method: "DELETE",
    body: JSON.stringify({}),
    signal
  });

export const clearPurchasedItems = (signal?: AbortSignal) =>
  apiRequest<{ clearedCount: number }>("/api/shopping/items/clear-purchased", {
    method: "POST",
    body: JSON.stringify({}),
    signal
  });

export const clearPurchasedShoppingItems = clearPurchasedItems;

export const listShoppingTemplates = (signal?: AbortSignal) =>
  apiRequest<{ templates: ShoppingTemplate[] }>("/api/shopping/templates", { signal });

export const getShoppingTemplate = (templateId: string, signal?: AbortSignal) =>
  apiRequest<{ template: ShoppingTemplate }>(`/api/shopping/templates/${templateId}`, { signal });

export const createShoppingTemplate = (input: CreateShoppingTemplateInput, signal?: AbortSignal) =>
  apiRequest<{ template: ShoppingTemplate }>("/api/shopping/templates", {
    method: "POST",
    body: JSON.stringify(input),
    signal
  });

export const updateShoppingTemplate = (
  templateId: string,
  input: UpdateShoppingTemplateInput,
  signal?: AbortSignal
) =>
  apiRequest<{ template: ShoppingTemplate }>(`/api/shopping/templates/${templateId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
    signal
  });

export const deleteShoppingTemplate = (templateId: string, signal?: AbortSignal) =>
  apiRequest<{ deleted: true }>(`/api/shopping/templates/${templateId}`, {
    method: "DELETE",
    body: JSON.stringify({}),
    signal
  });

export const addShoppingItemFromTemplate = (templateId: string, signal?: AbortSignal) =>
  apiRequest<{ item: ShoppingItem }>(`/api/shopping/templates/${templateId}/add`, {
    method: "POST",
    body: JSON.stringify({}),
    signal
  });

export const uploadShoppingItemImage = (itemId: string, image: ProcessedImage, signal?: AbortSignal) => {
  const body = new FormData();
  body.append("image", image.blob, "shopping-item.webp");
  body.append("width", String(image.width));
  body.append("height", String(image.height));
  return apiRequest<{ item: ShoppingItem }>(`/api/shopping/items/${itemId}/image`, { method: "PUT", body, signal });
};

export const deleteShoppingItemImage = (itemId: string, signal?: AbortSignal) =>
  apiRequest<void>(`/api/shopping/items/${itemId}/image`, { method: "DELETE", body: JSON.stringify({}), signal });

export const getShoppingItemImageUrl = (itemId: string, updatedAt?: string) =>
  `/api/shopping/items/${encodeURIComponent(itemId)}/image${updatedAt ? `?v=${encodeURIComponent(updatedAt)}` : ""}`;
