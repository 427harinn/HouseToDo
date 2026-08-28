import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createShoppingItem,
  deleteShoppingItem,
  getShoppingItem,
  getShoppingItemImageUrl,
  listShoppingItems,
  listShoppingTemplates,
  purchaseShoppingItem,
  unpurchaseShoppingItem,
  updateShoppingItem,
  uploadShoppingItemImage,
  deleteShoppingItemImage
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

    expect(fetchMock.mock.calls.map((call) => [call[0], (call[1] as RequestInit)?.method ?? "GET"])).toEqual([
      ["/api/shopping/items", "GET"],
      ["/api/shopping/items/i1", "GET"],
      ["/api/shopping/items", "POST"],
      ["/api/shopping/items/i1", "PATCH"],
      ["/api/shopping/items/i1/purchase", "POST"],
      ["/api/shopping/items/i1/unpurchase", "POST"],
      ["/api/shopping/items/i1", "DELETE"],
    ]);
  });

  it("sends template requests", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => Promise.resolve(ok({ template: { id: "t1" } })));

    await listShoppingTemplates();
    expect(fetchMock.mock.calls.map((call) => [call[0], (call[1] as RequestInit)?.method ?? "GET"])).toEqual([
      ["/api/shopping/templates", "GET"]
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
    const body = fetchMock.mock.calls[0]?.[1]?.body;
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get("image")).toMatchObject({ name: "shopping-item.webp" });
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: "DELETE" });
  });

  it("uses a JPEG filename for a JPEG processed image", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() => Promise.resolve(ok({ item: { id: "i1" } })));
    const image: ProcessedImage = { blob: new Blob(["jpeg"], { type: "image/jpeg" }), width: 80, height: 60, contentType: "image/jpeg", size: 4 };
    await uploadShoppingItemImage("i1", image);
    const body = fetchMock.mock.calls[0]?.[1]?.body;
    expect((body as FormData).get("image")).toMatchObject({ name: "shopping-item.jpg" });
  });
});
