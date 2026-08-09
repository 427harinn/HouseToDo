import { afterEach, describe, expect, it, vi } from "vitest";
import { getCurrentImageUsage } from "./image-usage";

const usage = {
  activeCount: 3,
  activeCountLimit: 50,
  activeBytes: 12_400_000,
  activeBytesLimit: 52_428_800,
  reservedCount: 0,
  reservedBytes: 0,
  pendingCleanupBytes: 0,
  pendingCleanupUnknownCount: 0,
  storedBytes: 12_400_000,
  storedBytesKnown: true,
  storedBytesLimit: 78_643_200,
  dailyUploadDate: "2026-08-09",
  dailyUploadCount: 4,
  dailyUploadLimit: 20
};

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });

afterEach(() => vi.restoreAllMocks());

describe("image usage api client", () => {
  it("gets the current household image usage", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response({ ok: true, data: usage, requestId: "req-1" })
    );

    await expect(getCurrentImageUsage()).resolves.toEqual(usage);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/households/current/image-usage",
      expect.objectContaining({ credentials: "include" })
    );
  });

  it("converts an error response to the shared ApiError", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response({ ok: false, error: { code: "INTERNAL_ERROR", message: "internal" }, requestId: "req-2" }, 500)
    );

    await expect(getCurrentImageUsage()).rejects.toMatchObject({ code: "INTERNAL_ERROR", status: 500 });
  });
});
