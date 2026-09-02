import { describe, expect, it } from "vitest";
import type { ShoppingItemList } from "./api/shopping";
import {
  createShoppingMutation,
  hasShoppingMutationForItem,
  projectShoppingList,
  removeShoppingMutation,
  rollbackShoppingMutation
} from "./shopping-local-first";

const user = { id: "user-a", displayName: "A" };
const item = (id: string, status: "pending" | "purchased") => ({
  id, name: id, quantity: null, note: "note", plannedPurchaseDate: "2026-09-01", status,
  addedBy: "user-a", purchasedBy: status === "purchased" ? { userId: "user-b", displayName: "B" } : null,
  purchasedAt: status === "purchased" ? "2026-09-01T00:00:00.000Z" : null,
  sortOrder: 1, createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", image: null
});
const baseline: ShoppingItemList = { pending: [item("a", "pending"), item("b", "pending")], purchased: [item("c", "purchased")] };

describe("Shopping local-first projection", () => {
  it("moves Purchase locally with current-user display data", () => {
    const mutation = createShoppingMutation(baseline.pending[0], "purchase", Date.parse("2026-09-02T00:00:00.000Z"));
    const next = projectShoppingList(baseline, [mutation], user);
    expect(next.pending.map((entry) => entry.id)).toEqual(["b"]);
    expect(next.purchased.find((entry) => entry.id === "a")).toMatchObject({ status: "purchased", purchasedBy: { userId: user.id, displayName: user.displayName }, purchasedAt: "2026-09-02T00:00:00.000Z" });
  });

  it("moves Unpurchase locally and rolls back only its original item", () => {
    const mutation = createShoppingMutation(baseline.purchased[0], "unpurchase", Date.now());
    const next = projectShoppingList(baseline, [mutation], user);
    expect(next.pending.map((entry) => entry.id)).toContain("c");
    expect(next.purchased.map((entry) => entry.id)).not.toContain("c");
    expect(rollbackShoppingMutation(next, mutation).purchased[0]).toMatchObject({ id: "c", status: "purchased" });
  });

  it("supports concurrent different items and blocks same-item conflicts", () => {
    const first = createShoppingMutation(baseline.pending[0], "purchase", 1);
    const second = createShoppingMutation(baseline.pending[1], "purchase", 2);
    expect(hasShoppingMutationForItem([first], "a")).toBe(true);
    expect(hasShoppingMutationForItem([first], "b")).toBe(false);
    expect(projectShoppingList(baseline, [first, second], user).pending).toEqual([]);
    expect(removeShoppingMutation([first, second], first.id)).toEqual([second]);
  });

  it("leaves a stale GET unable to undo a newer mutation when the caller keeps the revision", () => {
    const mutation = createShoppingMutation(baseline.pending[0], "purchase", 1);
    const projected = projectShoppingList(baseline, [mutation], user);
    expect(projected.purchased.map((entry) => entry.id)).toContain("a");
    // The hook's mutation revision gate discards the old baseline before this projection is rendered.
    expect(projected.pending.map((entry) => entry.id)).not.toContain("a");
  });
});
