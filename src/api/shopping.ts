import { apiRequest } from "./client";

export type ShoppingItemStatus = "pending" | "purchased";

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
