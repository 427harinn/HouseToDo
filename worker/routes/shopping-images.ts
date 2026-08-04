import { okJson } from "../lib/response";
import { validationError } from "../lib/errors";
import { requireAuth } from "../middleware/auth";
import type { Handler } from "../middleware/error-handler";
import { ShoppingItemImageService } from "../services/shopping-item-image-service";
import { ShoppingService } from "../services/shopping-service";

const parseUpload = async (request: Request) => {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("multipart/form-data")) throw validationError({ body: "multipart/form-dataが必要です。" });
  const form = await request.formData();
  const file = form.get("image");
  const width = Number(form.get("width"));
  const height = Number(form.get("height"));
  if (!(file instanceof Blob) || file.size === 0) throw validationError({ image: "画像ファイルを指定してください。" });
  if (!Number.isInteger(width) || !Number.isInteger(height)) throw validationError({ image: "画像サイズが不正です。" });
  return { body: await file.arrayBuffer(), width, height };
};

export const uploadShoppingItemImageRoute = (itemId: string): Handler => requireAuth(async (context) => {
  const image = await new ShoppingItemImageService(context.env.DB, context.env.ATTACHMENTS).upload(context.user!.id, itemId, await parseUpload(context.request));
  const item = await new ShoppingService(context.env.DB, context.env.ATTACHMENTS).getItem(context.user!.id, itemId);
  item.image = { available: true, width: image.width, height: image.height, size: image.sizeBytes, updatedAt: image.updatedAt };
  return okJson({ item: {
    ...item,
    image: item.image
  } }, context.requestId);
});

export const getShoppingItemImageRoute = (itemId: string): Handler => requireAuth(async (context) => {
  const { image, object } = await new ShoppingItemImageService(context.env.DB, context.env.ATTACHMENTS).get(context.user!.id, itemId);
  return new Response(object.body, {
    headers: {
      "content-type": image.contentType,
      "cache-control": "private, max-age=300",
      etag: `"${image.id}"`
    }
  });
});

export const deleteShoppingItemImageRoute = (itemId: string): Handler => requireAuth(async (context) => {
  await new ShoppingItemImageService(context.env.DB, context.env.ATTACHMENTS).delete(context.user!.id, itemId);
  return okJson({ deleted: true }, context.requestId);
});
