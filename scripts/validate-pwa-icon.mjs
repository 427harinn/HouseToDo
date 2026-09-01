import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Buffer } from "node:buffer";
import { inflateSync } from "node:zlib";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const iconDir = path.join(root, "public", "icons");
const expected = [180, 192, 512];
const expectedMint = [143, 211, 182];
const colorTolerance = 2;
const standardSizes = [180, 192, 512];
const maskableSizes = [192, 512];

function parsePng(buffer, fileName) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!buffer.subarray(0, 8).equals(signature))
    throw new Error(`${fileName}: invalid PNG signature`);
  let offset = 8;
  let header;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") header = data;
    if (type === "IDAT") idat.push(data);
    offset += length + 12;
    if (type === "IEND") break;
  }
  if (!header) throw new Error(`${fileName}: missing IHDR`);
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  const bitDepth = header[8];
  const colorType = header[9];
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (bitDepth !== 8 || channels === 0)
    throw new Error(
      `${fileName}: expected 8-bit RGB/RGBA PNG, got bit depth ${bitDepth}, color type ${colorType}`
    );

  const scanlines = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(width * height * channels);
  let previous = Buffer.alloc(stride);
  let position = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = scanlines[position++];
    const row = Buffer.from(scanlines.subarray(position, position + stride));
    position += stride;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? row[x - channels] : 0;
      const up = previous[x];
      const upperLeft = x >= channels ? previous[x - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = Math.floor((left + up) / 2);
      else if (filter === 4) {
        const estimate = left + up - upperLeft;
        const distanceLeft = Math.abs(estimate - left);
        const distanceUp = Math.abs(estimate - up);
        const distanceUpperLeft = Math.abs(estimate - upperLeft);
        predictor =
          distanceLeft <= distanceUp && distanceLeft <= distanceUpperLeft
            ? left
            : distanceUp <= distanceUpperLeft
              ? up
              : upperLeft;
      } else if (filter !== 0) {
        throw new Error(`${fileName}: unsupported PNG filter ${filter}`);
      }
      row[x] = (row[x] + predictor) & 255;
    }
    row.copy(pixels, y * stride);
    previous = row;
  }
  return { width, height, channels, pixels };
}

function pixelAt(parsed, x, y) {
  const start = (y * parsed.width + x) * parsed.channels;
  return Array.from(parsed.pixels.subarray(start, start + parsed.channels));
}

function assertMintOpaque(parsed, fileName, x, y, label) {
  const pixel = pixelAt(parsed, x, y);
  if (parsed.channels === 4 && pixel[3] !== 255)
    throw new Error(`${fileName}: ${label} alpha is ${pixel[3]}, expected opaque`);
  const matchesMint = expectedMint.every(
    (channel, index) => Math.abs(pixel[index] - channel) <= colorTolerance
  );
  if (!matchesMint)
    throw new Error(
      `${fileName}: ${label} pixel ${pixel.slice(0, 3).join(",")} is not mint ${expectedMint.join(",")} ±${colorTolerance}`
    );
}

const manifest = JSON.parse(
  await readFile(path.join(root, "public", "manifest.webmanifest"), "utf8")
);
if (
  manifest.name !== "HouseToDo" ||
  manifest.short_name !== "HouseToDo" ||
  manifest.display !== "standalone" ||
  manifest.start_url !== "/" ||
  manifest.scope !== "/" ||
  manifest.id !== "/"
) {
  throw new Error(
    "manifest.webmanifest: app identity or standalone routing semantics changed"
  );
}

async function validateIcon(fileName, size) {
  const filePath = path.join(iconDir, fileName);
  if (!existsSync(filePath)) throw new Error(`${fileName}: missing`);
  const parsed = parsePng(await readFile(filePath), fileName);
  if (parsed.width !== size || parsed.height !== size)
    throw new Error(`${fileName}: expected ${size}x${size}, got ${parsed.width}x${parsed.height}`);
  for (const [x, y, label] of [
    [0, 0, "top-left corner"],
    [size - 1, 0, "top-right corner"],
    [0, size - 1, "bottom-left corner"],
    [size - 1, size - 1, "bottom-right corner"],
    [Math.floor(size / 2), 0, "top edge"],
    [0, Math.floor(size / 2), "left edge"],
    [size - 1, Math.floor(size / 2), "right edge"],
    [Math.floor(size / 2), size - 1, "bottom edge"]
  ]) {
    assertMintOpaque(parsed, fileName, x, y, label);
  }
}

for (const size of standardSizes) {
  const fileName = `house-todo-v3-${size}.png`;
  await validateIcon(fileName, size);
}
for (const size of maskableSizes) {
  const fileName = `house-todo-v3-maskable-${size}.png`;
  await validateIcon(fileName, size);
}

for (const icon of manifest.icons) {
  if (
    !icon.src.endsWith(".png") ||
    !existsSync(path.join(root, "public", icon.src.slice(1)))
  ) {
    throw new Error(`manifest icon is missing or not PNG: ${icon.src}`);
  }
  if (icon.purpose !== "any" && icon.purpose !== "maskable")
    throw new Error(`manifest icon purpose must be "any" or "maskable": ${icon.src}`);
}
if (
  JSON.stringify(manifest.icons.map((icon) => icon.src)) !==
  JSON.stringify([
    "/icons/house-todo-v3-192.png",
    "/icons/house-todo-v3-512.png",
    "/icons/house-todo-v3-maskable-192.png",
    "/icons/house-todo-v3-maskable-512.png"
  ])
) {
  throw new Error("manifest.webmanifest: expected separate v3 standard and maskable sources");
}

const indexHtml = await readFile(path.join(root, "index.html"), "utf8");
const appleMatch = indexHtml.match(/<link\s+rel="apple-touch-icon"[^>]*href="([^"]+)"/);
if (!appleMatch || appleMatch[1] !== "/icons/house-todo-v3-180.png")
  throw new Error("index.html: apple-touch-icon does not point to the v3 180px asset");
if (!existsSync(path.join(root, "public", appleMatch[1].slice(1))))
  throw new Error("index.html: apple-touch-icon file is missing");

const runtimeFiles = [
  "index.html",
  "public/manifest.webmanifest",
  "public/sw.js",
  "worker/services/web-push-service.ts",
  "worker/services/notification-scheduler-service.ts",
  "scripts/run-m7-pwa-check.mjs"
];
for (const relative of runtimeFiles) {
  const contents = await readFile(path.join(root, relative), "utf8");
  if (/house-todo-(?:180|192|512)\.png/.test(contents))
    throw new Error(`${relative}: stale unversioned runtime icon reference`);
  if (/house-todo-v2-(?:180|192|512)\.png/.test(contents))
    throw new Error(`${relative}: stale v2 runtime icon reference`);
}

console.log(
  `PWA icon validation passed: ${expected.map((size) => `${size}x${size}`).join(", ")}; v3 dimensions, opaque mint edges, manifest/apple-touch/runtime references verified.`
);
