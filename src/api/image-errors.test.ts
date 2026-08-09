import { describe, expect, it } from "vitest";
import { ApiError } from "./client";
import { imageUploadErrorMessage } from "./image-errors";

describe("image upload error messages", () => {
  it.each([
    ["IMAGE_COUNT_LIMIT_REACHED", "保存できる画像数の上限に達しています。"],
    ["IMAGE_ACTIVE_BYTES_LIMIT_REACHED", "画像の使用容量が上限に達しています。"],
    ["IMAGE_STORED_BYTES_LIMIT_REACHED", "画像の保存容量が上限に達しています。"],
    ["IMAGE_STORED_BYTES_UNKNOWN", "現在は画像を追加できません。"],
    ["IMAGE_DAILY_UPLOAD_LIMIT_REACHED", "本日の画像アップロード上限に達しました。"],
    ["IMAGE_UPLOAD_IN_PROGRESS", "現在アップロード処理中です。"]
  ])("maps %s without exposing the code", (code, message) => {
    const result = imageUploadErrorMessage(new ApiError({ code: code as never, message: "internal", status: 409 }));
    expect(result).toContain(message);
    expect(result).not.toContain(code);
  });

  it("falls back for unknown errors", () => {
    expect(imageUploadErrorMessage(new ApiError({ code: "CONFLICT", message: "fallback" }))).toBeNull();
    expect(imageUploadErrorMessage(new Error("fallback"))).toBeNull();
  });
});
