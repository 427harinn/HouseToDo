import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addShoppingItemFromTemplate,
  clearPurchasedShoppingItems,
  createShoppingItem,
  createShoppingTemplate,
  deleteShoppingItem,
  deleteShoppingTemplate,
  listShoppingItems,
  listShoppingTemplates,
  purchaseShoppingItem,
  unpurchaseShoppingItem,
  updateShoppingItem,
  updateShoppingTemplate
} from "./shopping";

const ok = (data: unknown) =>
  new Response(JSON.stringify({ ok: true, data, requestId: "req" }), {
    headers: { "content-type": "application/json" }
  });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("shopping api clients", () => {
  it("sends item requests", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() => Promise.resolve(ok({ item: { id: "i1" } })));

    await listShoppingItems();
    await createShoppingItem({ name: "牛乳", quantity: "1本", note: null });
    await updateShoppingItem("i1", { quantity: null });
    await purchaseShoppingItem("i1");
    await unpurchaseShoppingItem("i1");
    await deleteShoppingItem("i1");
    await clearPurchasedShoppingItems();

    expect(fetchMock.mock.calls.map((call) => [call[0], (call[1] as RequestInit)?.method ?? "GET"])).toEqual([
      ["/api/shopping/items", "GET"],
      ["/api/shopping/items", "POST"],
      ["/api/shopping/items/i1", "PATCH"],
      ["/api/shopping/items/i1/purchase", "POST"],
      ["/api/shopping/items/i1/unpurchase", "POST"],
      ["/api/shopping/items/i1", "DELETE"],
      ["/api/shopping/items/clear-purchased", "POST"]
    ]);
  });

  it("sends template requests", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => Promise.resolve(ok({ template: { id: "t1" } })));

    await listShoppingTemplates();
    await createShoppingTemplate({ name: "卵", quantity: "1パック" });
    await updateShoppingTemplate("t1", { note: "いつもの" });
    await addShoppingItemFromTemplate("t1");
    await deleteShoppingTemplate("t1");

    expect(fetchMock.mock.calls.map((call) => [call[0], (call[1] as RequestInit)?.method ?? "GET"])).toEqual([
      ["/api/shopping/templates", "GET"],
      ["/api/shopping/templates", "POST"],
      ["/api/shopping/templates/t1", "PATCH"],
      ["/api/shopping/templates/t1/add", "POST"],
      ["/api/shopping/templates/t1", "DELETE"]
    ]);
  });
});
