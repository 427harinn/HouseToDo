export const MAX_SOURCE_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_PROCESSED_IMAGE_BYTES = 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 1280;

export type ProcessedImage = {
  blob: Blob;
  width: number;
  height: number;
  contentType: "image/webp" | "image/jpeg";
  size: number;
};

const supportedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

const loadBitmap = async (file: File): Promise<ImageBitmap | HTMLImageElement> => {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Some browsers expose createImageBitmap but do not support imageOrientation.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("image-load-failed"));
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
};

const canvasBlob = (canvas: HTMLCanvasElement, type: "image/webp" | "image/jpeg", quality: number): Promise<Blob> => new Promise((resolve, reject) => {
  canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("image-conversion-failed")), type, quality);
});

const encodeCanvas = async (canvas: HTMLCanvasElement, quality: number): Promise<Blob> => {
  const webp = await canvasBlob(canvas, "image/webp", quality);
  if (webp.type.toLowerCase() === "image/webp") return webp;
  const jpeg = await canvasBlob(canvas, "image/jpeg", quality);
  if (jpeg.type.toLowerCase() !== "image/jpeg") throw new Error("image-conversion-failed");
  return jpeg;
};

export async function processShoppingImage(file: File): Promise<ProcessedImage> {
  if (!supportedTypes.has(file.type.toLowerCase())) throw new Error("unsupported-image-type");
  if (file.size === 0 || file.size > MAX_SOURCE_IMAGE_BYTES) throw new Error("source-image-too-large");
  const bitmap = await loadBitmap(file);
  const sourceWidth = bitmap.width;
  const sourceHeight = bitmap.height;
  if (!sourceWidth || !sourceHeight) throw new Error("image-load-failed");
  let scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(sourceWidth, sourceHeight));
  for (let attempt = 0; attempt < 7; attempt += 1) {
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("image-conversion-failed");
    context.drawImage(bitmap, 0, 0, width, height);
    const quality = attempt === 0 ? 0.82 : attempt === 1 ? 0.72 : 0.62;
    const blob = await encodeCanvas(canvas, quality);
    if (blob.size <= MAX_PROCESSED_IMAGE_BYTES) {
      if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();
      const contentType = blob.type.toLowerCase();
      if (contentType !== "image/webp" && contentType !== "image/jpeg") throw new Error("image-conversion-failed");
      return { blob, width, height, contentType, size: blob.size };
    }
    if (attempt >= 2) scale *= 0.8;
  }
  if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();
  throw new Error("processed-image-too-large");
}
