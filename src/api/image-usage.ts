import { apiRequest } from "./client";

export type ImageUsage = {
  activeCount: number;
  activeCountLimit: number;
  activeBytes: number;
  activeBytesLimit: number;
  reservedCount: number;
  reservedBytes: number;
  pendingCleanupBytes: number;
  pendingCleanupUnknownCount: number;
  storedBytes: number;
  storedBytesKnown: boolean;
  storedBytesLimit: number;
  dailyUploadDate: string;
  dailyUploadCount: number;
  dailyUploadLimit: number;
};

export const getCurrentImageUsage = (signal?: AbortSignal) =>
  apiRequest<ImageUsage>("/api/households/current/image-usage", { signal });
