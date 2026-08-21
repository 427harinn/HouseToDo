import { okJson } from "../lib/response";
import { validationError } from "../lib/errors";
import { requireAuth } from "../middleware/auth";
import type { Handler } from "../middleware/error-handler";
import { avatarUrlFor } from "../services/auth-service";
import { UserAvatarService } from "../services/user-avatar-service";
import { UserRepository } from "../repositories/user-repository";

const parseUpload = async (request: Request) => {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("multipart/form-data"))
    throw validationError({ body: "multipart/form-dataが必要です。" });
  const form = await request.formData();
  const file = form.get("image");
  const width = Number(form.get("width"));
  const height = Number(form.get("height"));
  if (!(file instanceof Blob) || file.size === 0)
    throw validationError({ image: "画像ファイルを指定してください。" });
  if (!Number.isInteger(width) || !Number.isInteger(height))
    throw validationError({ image: "画像サイズが不正です。" });
  return {
    body: await file.arrayBuffer(),
    contentType: file.type.toLowerCase(),
    width,
    height
  };
};

export const uploadProfileImageRoute: Handler = requireAuth(async (context) => {
  const user = await new UserAvatarService(
    context.env.DB,
    context.env.ATTACHMENTS,
    context.env
  ).upload(context.user!.id, await parseUpload(context.request));
  return okJson({ avatarUrl: avatarUrlFor(user.id, user) }, context.requestId);
});

export const deleteProfileImageRoute: Handler = requireAuth(async (context) => {
  await new UserAvatarService(
    context.env.DB,
    context.env.ATTACHMENTS,
    context.env
  ).remove(context.user!.id);
  return okJson({ deleted: true, avatarUrl: null }, context.requestId);
});

export const getProfileImageRoute = (targetId: string): Handler =>
  requireAuth(async (context) => {
    const { user, object } = await new UserAvatarService(
      context.env.DB,
      context.env.ATTACHMENTS,
      context.env
    ).get(context.user!.id, targetId);
    return new Response(object.body, {
      headers: {
        "content-type": "image/webp",
        "cache-control": "private, max-age=300",
        etag: `"${user.updatedAt}"`
      }
    });
  });

export const profileImageMetadataRoute: Handler = requireAuth(async (context) => {
  const user = await new UserRepository(context.env.DB).findById(context.user!.id);
  return okJson(
    { avatarUrl: user ? avatarUrlFor(user.id, user) : null },
    context.requestId
  );
});
