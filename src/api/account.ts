import { apiRequest } from "./client";
import type { ProcessedImage } from "../lib/image-processing";
import type { AuthUser } from "../types";

export const uploadProfileImage = (image: ProcessedImage) => {
  const body = new FormData();
  body.append("image", image.blob, `profile-avatar.${image.contentType === "image/jpeg" ? "jpg" : "webp"}`);
  body.append("width", String(image.width));
  body.append("height", String(image.height));
  return apiRequest<{ avatarUrl: string | null }>("/api/account/avatar", {
    method: "PUT",
    body
  });
};

export const deleteProfileImage = () =>
  apiRequest<{ deleted: true; avatarUrl: null }>("/api/account/avatar", {
    method: "DELETE",
    body: JSON.stringify({})
  });

export const updateProfile = (displayName: string) =>
  apiRequest<{ user: AuthUser }>("/api/account/profile", {
    method: "PATCH",
    body: JSON.stringify({ displayName })
  });
