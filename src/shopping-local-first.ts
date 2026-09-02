import type { AuthUser } from "./types";
import type { ShoppingItem, ShoppingItemList } from "./api/shopping";

export type ShoppingMutationAction = "purchase" | "unpurchase";
export type ShoppingMutation = {
  id: string;
  itemId: string;
  action: ShoppingMutationAction;
  original: ShoppingItem;
  startedAt: number;
  phase: "transitioned";
};

const cloneItem = (item: ShoppingItem): ShoppingItem => ({
  ...item,
  purchasedBy: item.purchasedBy ? { ...item.purchasedBy } : null,
  image: item.image ? { ...item.image } : null
});

export const projectShoppingItem = (item: ShoppingItem, mutation: ShoppingMutation, user: Pick<AuthUser, "id" | "displayName">): ShoppingItem => {
  if (mutation.action === "purchase") {
    return {
      ...cloneItem(item),
      status: "purchased",
      purchasedBy: { userId: user.id, displayName: user.displayName },
      purchasedAt: new Date(mutation.startedAt).toISOString()
    };
  }
  return { ...cloneItem(item), status: "pending", purchasedBy: null, purchasedAt: null };
};

/** Applies only transitioned, transient overlays. It never mutates or persists the baseline. */
export const projectShoppingList = (baseline: ShoppingItemList, mutations: ShoppingMutation[], user: Pick<AuthUser, "id" | "displayName">): ShoppingItemList => {
  const active = new Map(mutations.map((mutation) => [mutation.itemId, mutation]));
  const all = [...baseline.pending, ...baseline.purchased].map(cloneItem);
  const projected = all.map((item) => {
    const mutation = active.get(item.id);
    return mutation ? projectShoppingItem(item, mutation, user) : item;
  });
  return {
    pending: projected.filter((item) => item.status === "pending"),
    purchased: projected.filter((item) => item.status === "purchased")
  };
};

export const createShoppingMutation = (item: ShoppingItem, action: ShoppingMutationAction, startedAt: number): ShoppingMutation => ({
  id: `${action}-${item.id}-${startedAt}`,
  itemId: item.id,
  action,
  original: cloneItem(item),
  startedAt,
  phase: "transitioned"
});

export const removeShoppingMutation = (mutations: ShoppingMutation[], mutationId: string) => mutations.filter((mutation) => mutation.id !== mutationId);
export const hasShoppingMutationForItem = (mutations: ShoppingMutation[], itemId: string) => mutations.some((mutation) => mutation.itemId === itemId);

export const mergeShoppingItem = (baseline: ShoppingItemList, item: ShoppingItem): ShoppingItemList => ({
  pending: [...baseline.pending.filter((candidate) => candidate.id !== item.id), ...(item.status === "pending" ? [item] : [])],
  purchased: [...baseline.purchased.filter((candidate) => candidate.id !== item.id), ...(item.status === "purchased" ? [item] : [])]
});

export const rollbackShoppingMutation = (baseline: ShoppingItemList, mutation: ShoppingMutation): ShoppingItemList => mergeShoppingItem(baseline, mutation.original);
