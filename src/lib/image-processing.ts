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

export type CropSource = {
  file: File;
  url: string;
  width: number;
  height: number;
};

export type AvatarCrop = {
  zoom: number;
  offsetX: number;
  offsetY: number;
};

export const AVATAR_CROP_VIEWPORT = 320;
export const AVATAR_OUTPUT_DIMENSION = 512;

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

const validateSourceFile = (file: File) => {
  if (!supportedTypes.has(file.type.toLowerCase())) throw new Error("unsupported-image-type");
  if (file.size === 0 || file.size > MAX_SOURCE_IMAGE_BYTES) throw new Error("source-image-too-large");
};

export async function createCropSource(file: File): Promise<CropSource> {
  validateSourceFile(file);
  const bitmap = await loadBitmap(file);
  const width = bitmap.width;
  const height = bitmap.height;
  if (!width || !height) throw new Error("image-load-failed");
  if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();
  return { file, url: URL.createObjectURL(file), width, height };
}

export async function processCroppedAvatar(source: CropSource, crop: AvatarCrop): Promise<ProcessedImage> {
  const bitmap = await loadBitmap(source.file);
  const sourceWidth = bitmap.width;
  const sourceHeight = bitmap.height;
  if (!sourceWidth || !sourceHeight) throw new Error("image-load-failed");

  const baseScale = Math.max(
    AVATAR_CROP_VIEWPORT / sourceWidth,
    AVATAR_CROP_VIEWPORT / sourceHeight
  );
  const zoom = Math.min(3, Math.max(1, crop.zoom));
  const scale = baseScale * zoom;
  const renderedWidth = sourceWidth * scale;
  const renderedHeight = sourceHeight * scale;
  const maxOffsetX = Math.max(0, (renderedWidth - AVATAR_CROP_VIEWPORT) / 2);
  const maxOffsetY = Math.max(0, (renderedHeight - AVATAR_CROP_VIEWPORT) / 2);
  const offsetX = Math.min(maxOffsetX, Math.max(-maxOffsetX, crop.offsetX));
  const offsetY = Math.min(maxOffsetY, Math.max(-maxOffsetY, crop.offsetY));
  const imageX = (AVATAR_CROP_VIEWPORT - renderedWidth) / 2 + offsetX;
  const imageY = (AVATAR_CROP_VIEWPORT - renderedHeight) / 2 + offsetY;
  const cropSize = Math.min(
    sourceWidth,
    sourceHeight,
    AVATAR_CROP_VIEWPORT / scale
  );
  const sourceX = Math.min(
    sourceWidth - cropSize,
    Math.max(0, -imageX / scale)
  );
  const sourceY = Math.min(
    sourceHeight - cropSize,
    Math.max(0, -imageY / scale)
  );
  const outputDimension = Math.max(1, Math.min(AVATAR_OUTPUT_DIMENSION, Math.floor(cropSize)));
  const canvas = document.createElement("canvas");
  canvas.width = outputDimension;
  canvas.height = outputDimension;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("image-conversion-failed");
  context.drawImage(
    bitmap,
    sourceX,
    sourceY,
    cropSize,
    cropSize,
    0,
    0,
    outputDimension,
    outputDimension
  );
  const blob = await encodeCanvas(canvas, 0.86);
  if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();
  const contentType = blob.type.toLowerCase();
  if (contentType !== "image/webp" && contentType !== "image/jpeg") throw new Error("image-conversion-failed");
  return { blob, width: outputDimension, height: outputDimension, contentType, size: blob.size };
}

export async function processShoppingImage(file: File): Promise<ProcessedImage> {
  validateSourceFile(file);
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
