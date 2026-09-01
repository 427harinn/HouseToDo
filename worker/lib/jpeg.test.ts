import { describe, expect, it } from "vitest";
import { readJpegDimensions } from "./jpeg";

const jpeg = (width: number, height: number) => new Uint8Array([
  0xff, 0xd8,
  0xff, 0xc0, 0x00, 0x11, 0x08,
  (height >> 8) & 0xff, height & 0xff,
  (width >> 8) & 0xff, width & 0xff,
  0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
  0xff, 0xd9
]);

describe("JPEG dimensions", () => {
  it("reads baseline JPEG dimensions", () => {
    expect(readJpegDimensions(jpeg(640, 480).buffer)).toEqual({ width: 640, height: 480 });
  });

  it("rejects malformed or non-JPEG bytes", () => {
    expect(readJpegDimensions(new Uint8Array([0xff, 0xd8, 0xff, 0xc0]).buffer)).toBeNull();
    expect(readJpegDimensions(new TextEncoder().encode("not jpeg").buffer)).toBeNull();
  });
});
