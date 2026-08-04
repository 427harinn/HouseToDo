import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addShoppingItemFromTemplate,
  clearPurchasedItems,
  createShoppingItem,
  createShoppingTemplate,
  deleteShoppingItem,
  deleteShoppingTemplate,
  getShoppingItem,
  getShoppingItemImageUrl,
  getShoppingTemplate,
  listShoppingItems,
  listShoppingTemplates,
  purchaseShoppingItem,
  unpurchaseShoppingItem,
  updateShoppingItem,
  updateShoppingTemplate
  , uploadShoppingItemImage, deleteShoppingItemImage
} from "./shopping";
import type { ProcessedImage } from "../lib/image-processing";

const ok = (data: unknown) =>
  new Response(JSON.stringify({ ok: true, data, requestId: "req" }), {
    headers: { "content-type": "application/json" }
  });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("shopping api clients", () => {
  it("sends item requests", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => Promise.resolve(ok({ item: { id: "i1" } })));

    await listShoppingItems();
    await getShoppingItem("i1");
    await createShoppingItem({ name: "牛乳", quantity: "1本", note: null });
    await updateShoppingItem("i1", { quantity: null });
    await purchaseShoppingItem("i1");
    await unpurchaseShoppingItem("i1");
    await deleteShoppingItem("i1");
    await clearPurchasedItems();

    expect(fetchMock.mock.calls.map((call) => [call[0], (call[1] as RequestInit)?.method ?? "GET"])).toEqual([
      ["/api/shopping/items", "GET"],
      ["/api/shopping/items/i1", "GET"],
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
    await getShoppingTemplate("t1");
    await createShoppingTemplate({ name: "卵", quantity: "1パック" });
    await updateShoppingTemplate("t1", { note: "いつもの" });
    await addShoppingItemFromTemplate("t1");
    await deleteShoppingTemplate("t1");

    expect(fetchMock.mock.calls.map((call) => [call[0], (call[1] as RequestInit)?.method ?? "GET"])).toEqual([
      ["/api/shopping/templates", "GET"],
      ["/api/shopping/templates/t1", "GET"],
      ["/api/shopping/templates", "POST"],
      ["/api/shopping/templates/t1", "PATCH"],
      ["/api/shopping/templates/t1/add", "POST"],
      ["/api/shopping/templates/t1", "DELETE"]
    ]);
  });

  it("sends image upload/delete requests and builds versioned URLs", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() => Promise.resolve(ok({ item: { id: "i1" } })));
    const image: ProcessedImage = { blob: new Blob(["RIFFxxxxWEBP"], { type: "image/webp" }), width: 80, height: 60, contentType: "image/webp", size: 12 };
    await uploadShoppingItemImage("i1", image);
    await deleteShoppingItemImage("i1");
    expect(getShoppingItemImageUrl("i1", "2026-08-01T00:00:00Z")).toContain("/api/shopping/items/i1/image?v=");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "PUT" });
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: "DELETE" });
  });
});
