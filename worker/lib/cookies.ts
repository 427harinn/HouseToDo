import { SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from "./constants";
import type { AppEnvironment } from "../types/env";

const isSecureEnvironment = (appEnv?: AppEnvironment): boolean => appEnv === "staging" || appEnv === "production";

export const createSessionCookie = (token: string, appEnv?: AppEnvironment): string => {
  const attributes = [
    `${SESSION_COOKIE_NAME}=${token}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${SESSION_TTL_SECONDS}`
  ];
  if (isSecureEnvironment(appEnv)) attributes.push("Secure");
  return attributes.join("; ");
};

export const createExpiredSessionCookie = (appEnv?: AppEnvironment): string => {
  const attributes = [
    `${SESSION_COOKIE_NAME}=`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=0"
  ];
  if (isSecureEnvironment(appEnv)) attributes.push("Secure");
  return attributes.join("; ");
};

export const readCookie = (request: Request, name: string): string | null => {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (rawKey === name) {
      return rawValue.join("=") || null;
    }
  }
  return null;
};
