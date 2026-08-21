export type WebpDimensions = {
  width: number;
  height: number;
  source: "VP8 " | "VP8L" | "VP8X";
};

const ascii = (bytes: Uint8Array, offset: number): string =>
  String.fromCharCode(...bytes.slice(offset, offset + 4));

const readUint16 = (bytes: Uint8Array, offset: number): number =>
  bytes[offset] | (bytes[offset + 1] << 8);

const readUint24 = (bytes: Uint8Array, offset: number): number =>
  bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);

const readUint32 = (bytes: Uint8Array, offset: number): number =>
  bytes[offset] |
  (bytes[offset + 1] << 8) |
  (bytes[offset + 2] << 16) |
  (bytes[offset + 3] << 24);

const validDimensions = (width: number, height: number): WebpDimensions | null =>
  width > 0 && height > 0 ? { width, height, source: "VP8 " } : null;

const readVp8Dimensions = (data: Uint8Array): WebpDimensions | null => {
  if (data.length < 10) return null;
  const frameTag = data[0] | (data[1] << 8) | (data[2] << 16);
  if ((frameTag & 1) !== 0) return null;
  if (data[3] !== 0x9d || data[4] !== 0x01 || data[5] !== 0x2a) return null;
  const dimensions = validDimensions(
    readUint16(data, 6) & 0x3fff,
    readUint16(data, 8) & 0x3fff
  );
  return dimensions ? { ...dimensions, source: "VP8 " } : null;
};

const readVp8lDimensions = (data: Uint8Array): WebpDimensions | null => {
  if (data.length < 5 || data[0] !== 0x2f) return null;
  const width = 1 + (data[1] | ((data[2] & 0x3f) << 8));
  const height = 1 + ((data[2] >> 6) | (data[3] << 2) | ((data[4] & 0x0f) << 10));
  const dimensions = validDimensions(width, height);
  return dimensions ? { ...dimensions, source: "VP8L" } : null;
};

const readVp8xDimensions = (data: Uint8Array): WebpDimensions | null => {
  if (data.length < 10) return null;
  const dimensions = validDimensions(1 + readUint24(data, 4), 1 + readUint24(data, 7));
  return dimensions ? { ...dimensions, source: "VP8X" } : null;
};

export const readWebpDimensions = (body: ArrayBuffer): WebpDimensions | null => {
  const bytes = new Uint8Array(body);
  if (bytes.length < 20 || ascii(bytes, 0) !== "RIFF" || ascii(bytes, 8) !== "WEBP")
    return null;
  const riffEnd = readUint32(bytes, 4) + 8;
  if (riffEnd < 20 || riffEnd > bytes.length) return null;

  let offset = 12;
  let extendedDimensions: WebpDimensions | null = null;
  let bitstreamDimensions: WebpDimensions | null = null;
  while (offset + 8 <= riffEnd) {
    const chunkType = ascii(bytes, offset);
    const chunkSize = readUint32(bytes, offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + chunkSize;
    if (dataEnd > riffEnd) return null;
    const data = bytes.slice(dataStart, dataEnd);
    if (chunkType === "VP8X" && extendedDimensions === null)
      extendedDimensions = readVp8xDimensions(data);
    if (chunkType === "VP8 " && bitstreamDimensions === null)
      bitstreamDimensions = readVp8Dimensions(data);
    if (chunkType === "VP8L" && bitstreamDimensions === null)
      bitstreamDimensions = readVp8lDimensions(data);
    offset = dataEnd + (chunkSize & 1);
  }
  if (offset !== riffEnd) return null;
  return extendedDimensions ?? bitstreamDimensions;
};
