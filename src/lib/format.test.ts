import { describe, expect, it } from "vitest";
import { formatBytes } from "./format";

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
