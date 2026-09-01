import { afterEach, describe, expect, it, vi } from "vitest";
import { processCroppedAvatar, processShoppingImage, type CropSource } from "./image-processing";

describe("shopping image processing", () => {
  afterEach(() => vi.restoreAllMocks());

  it("rejects unsupported and oversized source files", async () => {
    await expect(processShoppingImage(new File(["x"], "x.gif", { type: "image/gif" }))).rejects.toThrow("unsupported-image-type");
    await expect(processShoppingImage(new File([new Uint8Array(10 * 1024 * 1024 + 1)], "x.jpg", { type: "image/jpeg" }))).rejects.toThrow("source-image-too-large");
  });

  it("shrinks a large image without enlarging small images and returns WebP", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 2400, height: 1200 }));
    const canvas = { width: 0, height: 0, getContext: vi.fn(() => ({ drawImage: vi.fn() })), toBlob: vi.fn((callback: BlobCallback) => callback(new Blob(["webp"], { type: "image/webp" }))) };
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => tagName === "canvas" ? canvas as unknown as HTMLElement : originalCreateElement(tagName));
    const result = await processShoppingImage(new File(["jpeg"], "x.jpg", { type: "image/jpeg" }));
    expect(result.contentType).toBe("image/webp");
    expect(result.width).toBe(1280);
    expect(result.height).toBe(640);
    expect(result.size).toBe(result.blob.size);
  });

  it("uses JPEG when WebP encoding falls back to another browser-supported type", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 1600, height: 800 }));
    const requestedTypes: string[] = [];
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage: vi.fn() })),
      toBlob: vi.fn((callback: BlobCallback, type?: string) => {
        requestedTypes.push(type ?? "");
        callback(type === "image/webp" ? new Blob(["png"], { type: "image/png" }) : new Blob(["jpeg"], { type: "image/jpeg" }));
      })
    };
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => tagName === "canvas" ? canvas as unknown as HTMLElement : originalCreateElement(tagName));

    const result = await processShoppingImage(new File(["jpeg"], "x.jpg", { type: "image/jpeg" }));

    expect(requestedTypes).toEqual(["image/webp", "image/jpeg"]);
    expect(result.contentType).toBe("image/jpeg");
    expect(result.blob.type).toBe("image/jpeg");
    expect(result.size).toBeLessThanOrEqual(1024 * 1024);
    expect(result.width).toBe(1280);
    expect(result.height).toBe(640);
  });

  it("returns a deterministic square crop without upscaling tiny source crops", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 1600, height: 800, close: vi.fn() }));
    const drawImage = vi.fn();
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage })),
      toBlob: vi.fn((callback: BlobCallback) => callback(new Blob(["webp"], { type: "image/webp" })))
    };
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => tagName === "canvas" ? canvas as unknown as HTMLElement : originalCreateElement(tagName));
    const source: CropSource = {
      file: new File(["jpeg"], "portrait.jpg", { type: "image/jpeg" }),
      url: "blob:portrait",
      width: 1600,
      height: 800
    };

    const result = await processCroppedAvatar(source, { zoom: 1.5, offsetX: 40, offsetY: 0 });

    expect(result.width).toBe(512);
    expect(result.height).toBe(512);
    const drawArgs = drawImage.mock.calls[0];
    expect(drawArgs?.[0]).toMatchObject({ width: 1600, height: 800 });
    expect(drawArgs?.[1]).toBeCloseTo(466.67, 2);
    expect(drawArgs?.[2]).toBeCloseTo(133.33, 2);
    expect(drawArgs?.[3]).toBeCloseTo(533.33, 2);
    expect(drawArgs?.[4]).toBeCloseTo(533.33, 2);
    expect(drawArgs?.slice(5)).toEqual([0, 0, 512, 512]);
  });
});
