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

export type ShoppingUpdateInput = {
  name?: string;
  quantity?: string | null;
  note?: string | null;
};

export const listShoppingItems = (signal?: AbortSignal) =>
  apiRequest<{ pending: ShoppingItem[]; purchased: ShoppingItem[] }>("/api/shopping/items", { signal });

export const createShoppingItem = (input: ShoppingWriteInput, signal?: AbortSignal) =>
  apiRequest<{ item: ShoppingItem }>("/api/shopping/items", {
    method: "POST",
    body: JSON.stringify(input),
    signal
  });

export const updateShoppingItem = (itemId: string, input: ShoppingUpdateInput, signal?: AbortSignal) =>
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

export const clearPurchasedShoppingItems = (signal?: AbortSignal) =>
  apiRequest<{ clearedCount: number }>("/api/shopping/items/clear-purchased", {
    method: "POST",
    body: JSON.stringify({}),
    signal
  });

export const listShoppingTemplates = (signal?: AbortSignal) =>
  apiRequest<{ templates: ShoppingTemplate[] }>("/api/shopping/templates", { signal });

export const createShoppingTemplate = (input: ShoppingWriteInput, signal?: AbortSignal) =>
  apiRequest<{ template: ShoppingTemplate }>("/api/shopping/templates", {
    method: "POST",
    body: JSON.stringify(input),
    signal
  });

export const updateShoppingTemplate = (
  templateId: string,
  input: ShoppingUpdateInput,
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
