export const DEFAULT_IMAGE_LIMITS = {
  activeCount: 50,
  activeBytes: 52_428_800,
  storedBytes: 78_643_200,
  dailyUploads: 20,
  reservationTtlSeconds: 900
} as const;

export type ImageLimits = {
  activeCount: number;
  activeBytes: number;
  storedBytes: number;
  dailyUploads: number;
  reservationTtlSeconds: number;
};

const parsePositiveInteger = (value: string | undefined, fallback: number): number => {
  if (value === undefined || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export const getImageLimits = (env: {
  IMAGE_ACTIVE_COUNT_LIMIT?: string;
  IMAGE_ACTIVE_BYTES_LIMIT?: string;
  IMAGE_STORED_BYTES_LIMIT?: string;
  IMAGE_DAILY_UPLOAD_LIMIT?: string;
  IMAGE_UPLOAD_RESERVATION_TTL_SECONDS?: string;
}): ImageLimits => ({
  activeCount: parsePositiveInteger(env.IMAGE_ACTIVE_COUNT_LIMIT, DEFAULT_IMAGE_LIMITS.activeCount),
  activeBytes: parsePositiveInteger(env.IMAGE_ACTIVE_BYTES_LIMIT, DEFAULT_IMAGE_LIMITS.activeBytes),
  storedBytes: parsePositiveInteger(env.IMAGE_STORED_BYTES_LIMIT, DEFAULT_IMAGE_LIMITS.storedBytes),
  dailyUploads: parsePositiveInteger(env.IMAGE_DAILY_UPLOAD_LIMIT, DEFAULT_IMAGE_LIMITS.dailyUploads),
  reservationTtlSeconds: parsePositiveInteger(env.IMAGE_UPLOAD_RESERVATION_TTL_SECONDS, DEFAULT_IMAGE_LIMITS.reservationTtlSeconds)
});
