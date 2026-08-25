import { describe, expect, it } from "vitest";
import { visiblePurchasedShoppingItems } from "./shopping-visibility";

describe("shopping purchased visibility", () => {
  it("uses a supplied wall-clock instant deterministically at the seven-day boundary", () => {
    const now = Date.parse("2026-08-25T00:00:00.000Z");
    const visible = { id: "visible", purchasedAt: "2026-08-18T00:00:00.001Z" };
    const hidden = { id: "hidden", purchasedAt: "2026-08-18T00:00:00.000Z" };
    expect(visiblePurchasedShoppingItems([visible, hidden], now).map((item) => item.id)).toEqual(["visible"]);
  });
});
