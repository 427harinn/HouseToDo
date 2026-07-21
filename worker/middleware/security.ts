import { invalidOriginError, validationError } from "../lib/errors";
import type { Env } from "../types/env";
import type { Handler } from "./error-handler";

const stateChangingMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const developmentOrigins = ["http://127.0.0.1:5174", "http://localhost:5174"];

const parseAllowedOrigins = (env: Env): string[] => {
  const raw = env.ALLOWED_ORIGINS?.trim();
  if (raw) {
    return raw
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  return env.APP_ENV === "development" || env.APP_ENV === "test" ? developmentOrigins : [];
};

export const validateStateChangingRequest = (request: Request, env: Env): void => {
  if (!stateChangingMethods.has(request.method)) return;

  const origin = request.headers.get("origin");
  if (!origin || !parseAllowedOrigins(env).includes(origin)) {
    throw invalidOriginError();
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw validationError({ body: "Content-Typeはapplication/jsonで送信してください。" });
  }
};

export const withStateChangingRequestProtection =
  (handler: Handler): Handler =>
  async (context) => {
    validateStateChangingRequest(context.request, context.env);
    return handler(context);
  };
