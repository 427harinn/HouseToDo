import { validationError } from "./errors";
import {
  MAX_IMAGE_BYTES,
  MAX_IMAGE_DIMENSION,
  type ImageUploadInput
} from "../services/shopping-item-image-service";

export const MAX_MCP_IMAGE_REQUEST_BYTES =
  Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 16 * 1024;

const object = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const invalid = (field: string, message: string): never => {
  throw validationError({ [field]: message });
};

export type McpShoppingImageUploadInput = {
  itemId: string;
  image: ImageUploadInput;
};

export const parseMcpShoppingImageUploadInput = (
  value: unknown
): McpShoppingImageUploadInput => {
  const args = object(value);
  if (
    !args ||
    Object.keys(args).some((key) => !["itemId", "image"].includes(key))
  )
    return invalid("arguments", "itemId and image are required.");

  if (typeof args.itemId !== "string" || !args.itemId.trim())
    return invalid("itemId", "itemId is required.");

  const image = object(args.image);
  if (
    !image ||
    Object.keys(image).some(
      (key) =>
        !["dataBase64", "mimeType", "width", "height", "fileName"].includes(key)
    )
  )
    return invalid("image", "image must contain encoded image data and metadata.");

  const { dataBase64, mimeType, width, height, fileName } = image;
  if (typeof dataBase64 !== "string" || dataBase64.length === 0)
    return invalid("image.dataBase64", "image.dataBase64 must be a base64 string.");
  if (dataBase64.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4)
    return invalid("image.dataBase64", "The decoded image must be 1 MB or smaller.");
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      dataBase64
    )
  )
    return invalid("image.dataBase64", "image.dataBase64 must use standard base64 encoding.");

  if (mimeType !== "image/jpeg" && mimeType !== "image/webp")
    return invalid("image.mimeType", "Use image/jpeg or image/webp.");
  if (
    typeof width !== "number" ||
    !Number.isInteger(width) ||
    width < 1 ||
    width > MAX_IMAGE_DIMENSION
  )
    return invalid("image.width", `width must be an integer from 1 to ${MAX_IMAGE_DIMENSION}.`);
  if (
    typeof height !== "number" ||
    !Number.isInteger(height) ||
    height < 1 ||
    height > MAX_IMAGE_DIMENSION
  )
    return invalid("image.height", `height must be an integer from 1 to ${MAX_IMAGE_DIMENSION}.`);
  if (fileName !== undefined && (typeof fileName !== "string" || fileName.length > 255))
    return invalid("image.fileName", "fileName must be a string of at most 255 characters.");

  let binary: string;
  try {
    binary = atob(dataBase64);
  } catch {
    return invalid("image.dataBase64", "image.dataBase64 must use standard base64 encoding.");
  }
  if (binary.length > MAX_IMAGE_BYTES)
    return invalid("image.dataBase64", "The decoded image must be 1 MB or smaller.");

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);

  return {
    itemId: args.itemId.trim(),
    image: {
      body: bytes.buffer,
      contentType: mimeType,
      width,
      height
    }
  };
};
