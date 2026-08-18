import { describe, expect, it } from "vitest";
import { formatBytes, formatDateTime } from "./format";

describe("formatBytes", () => {
  it.each([
    [0, "0 B"],
    [1024, "1 KB"],
    [1024 ** 2, "1 MB"],
    [50 * 1024 ** 2, "50 MB"],
    [75 * 1024 ** 2, "75 MB"],
    [1.25 * 1024 ** 2, "1.3 MB"],
    [1024 ** 3, "1 GB"],
    [Number.NaN, "0 B"],
    [Number.POSITIVE_INFINITY, "0 B"],
    [-1, "0 B"]
  ])("formats %s bytes as %s", (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });
});

describe("formatDateTime", () => {
  it("formats a UTC purchase timestamp in the household timezone", () => {
    expect(formatDateTime("2026-08-18T10:32:00.000Z", "Asia/Tokyo")).toBe("2026/8/18 19:32");
  });

  it("applies the timezone at a date boundary", () => {
    expect(formatDateTime("2026-08-18T15:32:00.000Z", "Asia/Tokyo")).toBe("2026/8/19 00:32");
  });

  it("returns an empty string for a missing timestamp", () => {
    expect(formatDateTime(null, "Asia/Tokyo")).toBe("");
  });
});
