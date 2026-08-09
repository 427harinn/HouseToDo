import { ApiError } from "./client";

const imageErrorMessages: Record<string, string> = {
  IMAGE_COUNT_LIMIT_REACHED: "保存できる画像数の上限に達しています。\n不要な画像を削除してから、もう一度お試しください。",
  IMAGE_ACTIVE_BYTES_LIMIT_REACHED: "画像の使用容量が上限に達しています。\n不要な画像を削除してから、もう一度お試しください。",
  IMAGE_STORED_BYTES_LIMIT_REACHED: "画像の保存容量が上限に達しています。\n削除処理が完了するまで待つか、不要な画像を削除してください。",
  IMAGE_STORED_BYTES_UNKNOWN: "削除処理中の画像があるため、現在は画像を追加できません。\nしばらく待ってからもう一度お試しください。",
  IMAGE_DAILY_UPLOAD_LIMIT_REACHED: "本日の画像アップロード上限に達しました。\n明日もう一度お試しください。",
  IMAGE_UPLOAD_IN_PROGRESS: "この画像は現在アップロード処理中です。\n処理が終わってからもう一度お試しください。"
};

export const imageUploadErrorMessage = (error: unknown): string | null =>
  error instanceof ApiError ? imageErrorMessages[error.code] ?? null : null;
