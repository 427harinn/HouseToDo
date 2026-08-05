export type AppEnvironment = "development" | "staging" | "production" | "test";

export interface Env {
  DB: D1Database;
  ATTACHMENTS: R2Bucket;
  ASSETS: Fetcher;
  APP_ENV?: AppEnvironment;
  ALLOWED_ORIGINS?: string;
  IMAGE_ACTIVE_COUNT_LIMIT?: string;
  IMAGE_ACTIVE_BYTES_LIMIT?: string;
  IMAGE_STORED_BYTES_LIMIT?: string;
  IMAGE_DAILY_UPLOAD_LIMIT?: string;
  IMAGE_UPLOAD_RESERVATION_TTL_SECONDS?: string;
}
