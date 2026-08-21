import { describe, expect, it } from "vitest";
import { readWebpDimensions } from "./webp";

const riff = (chunkType: string, data: Uint8Array): ArrayBuffer => {
  const paddedSize = data.length + (data.length & 1);
  const bytes = new Uint8Array(12 + 8 + paddedSize);
  bytes.set([82, 73, 70, 70], 0);
  new DataView(bytes.buffer).setUint32(4, bytes.length - 8, true);
  bytes.set([87, 69, 66, 80], 8);
  for (let index = 0; index < 4; index += 1)
    bytes[12 + index] = chunkType.charCodeAt(index);
  new DataView(bytes.buffer).setUint32(16, data.length, true);
  bytes.set(data, 20);
  return bytes.buffer;
};

const vp8x = (width: number, height: number) => {
  const data = new Uint8Array(10);
  data[4] = (width - 1) & 0xff;
  data[5] = ((width - 1) >> 8) & 0xff;
  data[6] = (width - 1) >> 16;
  data[7] = (height - 1) & 0xff;
  data[8] = ((height - 1) >> 8) & 0xff;
  data[9] = (height - 1) >> 16;
  return riff("VP8X", data);
};

const vp8 = (width: number, height: number) => {
  const data = new Uint8Array(10);
  data.set([0, 0, 0, 0x9d, 0x01, 0x2a]);
  new DataView(data.buffer).setUint16(6, width, true);
  new DataView(data.buffer).setUint16(8, height, true);
  return riff("VP8 ", data);
};

const vp8l = (width: number, height: number) => {
  const data = new Uint8Array(5);
  const packedWidth = width - 1;
  const packedHeight = height - 1;
  data[0] = 0x2f;
  data[1] = packedWidth & 0xff;
  data[2] = ((packedWidth >> 8) & 0x3f) | ((packedHeight & 0x03) << 6);
  data[3] = (packedHeight >> 2) & 0xff;
  data[4] = (packedHeight >> 10) & 0x0f;
  return riff("VP8L", data);
};

describe("WebP dimensions", () => {
  it.each([
    ["VP8 ", vp8(320, 240), { width: 320, height: 240, source: "VP8 " }],
    ["VP8L", vp8l(640, 480), { width: 640, height: 480, source: "VP8L" }],
    ["VP8X", vp8x(1280, 720), { width: 1280, height: 720, source: "VP8X" }]
  ])("reads %s dimensions from the encoded body", (_source, body, expected) => {
    expect(readWebpDimensions(body)).toEqual(expected);
  });

  it("rejects truncated or malformed RIFF data", () => {
    expect(readWebpDimensions(new Uint8Array([82, 73, 70, 70]).buffer)).toBeNull();
    const malformed = new Uint8Array(vp8x(1281, 80));
    new DataView(malformed.buffer).setUint32(16, 100, true);
    expect(readWebpDimensions(malformed.buffer)).toBeNull();
  });
});
