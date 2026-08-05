import { describe, expect, it } from "vitest";
import { DEFAULT_IMAGE_LIMITS, getImageLimits } from "./image-limits";

describe("image limits", () => {
  it("uses standard defaults when values are missing or invalid", () => {
    expect(getImageLimits({})).toEqual(DEFAULT_IMAGE_LIMITS);
    expect(getImageLimits({ IMAGE_ACTIVE_COUNT_LIMIT: "0", IMAGE_ACTIVE_BYTES_LIMIT: "-1", IMAGE_STORED_BYTES_LIMIT: "1.5", IMAGE_DAILY_UPLOAD_LIMIT: "NaN", IMAGE_UPLOAD_RESERVATION_TTL_SECONDS: "" })).toEqual(DEFAULT_IMAGE_LIMITS);
  });

  it("accepts positive integer environment values", () => {
    expect(getImageLimits({ IMAGE_ACTIVE_COUNT_LIMIT: "10", IMAGE_ACTIVE_BYTES_LIMIT: "200", IMAGE_STORED_BYTES_LIMIT: "300", IMAGE_DAILY_UPLOAD_LIMIT: "4", IMAGE_UPLOAD_RESERVATION_TTL_SECONDS: "60" })).toEqual({ activeCount: 10, activeBytes: 200, storedBytes: 300, dailyUploads: 4, reservationTtlSeconds: 60 });
  });
});
