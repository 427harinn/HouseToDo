export const SHOPPING_PURCHASED_VISIBLE_MS = 7 * 24 * 60 * 60 * 1000;

export type PurchasedAtItem = { purchasedAt: string | null };

export const visiblePurchasedShoppingItems = <T extends PurchasedAtItem>(items: T[], now: number) =>
  items.filter((item) => {
    if (!item.purchasedAt) return false;
    const age = now - Date.parse(item.purchasedAt);
    return age >= 0 && age < SHOPPING_PURCHASED_VISIBLE_MS;
  });
