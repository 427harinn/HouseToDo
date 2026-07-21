import { SESSION_TTL_SECONDS } from "./constants";

export const nowIso = (): string => new Date().toISOString();

export const sessionExpiresAt = (now = new Date()): string =>
  new Date(now.getTime() + SESSION_TTL_SECONDS * 1000).toISOString();

export const expiresAtFromSeconds = (seconds: number, now = new Date()): string =>
  new Date(now.getTime() + seconds * 1000).toISOString();

export const isExpired = (isoDate: string, now = new Date()): boolean =>
  new Date(isoDate).getTime() <= now.getTime();
