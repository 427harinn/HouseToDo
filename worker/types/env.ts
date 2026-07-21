export type AppEnvironment = "development" | "production" | "test";

export interface Env {
  DB: D1Database;
  ATTACHMENTS: R2Bucket;
  ASSETS: Fetcher;
  APP_ENV?: AppEnvironment;
  ALLOWED_ORIGINS?: string;
}
