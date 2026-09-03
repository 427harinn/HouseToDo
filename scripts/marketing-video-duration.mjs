import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const videoDirectory = path.join(repoRoot, "marketing", "app-store", "raw", "videos");
const videoNames = ["01-basic-home-actions.webm", "02-feature-walkthrough.webm"];

const readVint = (data, offset, preserveMarker = false) => {
  const first = data[offset];
  if (first === undefined) throw new Error(`Invalid WebM variable-length integer at ${offset}`);

  let mask = 0x80;
  let length = 1;
  while (length <= 8 && (first & mask) === 0) {
    mask >>= 1;
    length += 1;
  }
  if (length > 8 || offset + length > data.length) throw new Error(`Invalid WebM variable-length integer at ${offset}`);

  let value = preserveMarker ? first : first & (mask - 1);
  for (let index = 1; index < length; index += 1) value = value * 256 + data[offset + index];
  return { length, value };
};

const findInfoValues = (data, start, end) => {
  let timecodeScale;
  let duration;
  let offset = start;

  while (offset < end) {
    const id = readVint(data, offset, true);
    offset += id.length;
    const size = readVint(data, offset);
    offset += size.length;
    const valueEnd = Math.min(end, offset + size.value);

    if (id.value === 0x2ad7b1) {
      timecodeScale = Number(data.subarray(offset, valueEnd).reduce((value, byte) => value * 256 + byte, 0));
    } else if (id.value === 0x4489) {
      const byteLength = valueEnd - offset;
      if (byteLength === 4) duration = data.readFloatBE(offset);
      if (byteLength === 8) duration = data.readDoubleBE(offset);
    }
    offset = valueEnd;
  }

  return { timecodeScale, duration };
};

const getDurationSeconds = (data) => {
  const infoId = Buffer.from([0x15, 0x49, 0xa9, 0x66]);
  for (let offset = 0; offset <= data.length - infoId.length; offset += 1) {
    if (!data.subarray(offset, offset + infoId.length).equals(infoId)) continue;
    const size = readVint(data, offset + infoId.length);
    const infoStart = offset + infoId.length + size.length;
    const infoEnd = Math.min(data.length, infoStart + size.value);
    const { timecodeScale = 1_000_000, duration } = findInfoValues(data, infoStart, infoEnd);
    if (duration !== undefined && Number.isFinite(duration)) return duration * timecodeScale / 1_000_000_000;
  }
  throw new Error("WebM duration metadata was not found");
};

for (const videoName of videoNames) {
  const videoPath = path.join(videoDirectory, videoName);
  const data = await readFile(videoPath);
  console.log(`${videoName}: ${getDurationSeconds(data).toFixed(2)}s`);
}
