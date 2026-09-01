import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Buffer } from "node:buffer";
import { inflateSync } from "node:zlib";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const iconDir = path.join(root, "public", "icons");
const expected = [180, 192, 512];

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
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6))
    throw new Error(
      `${fileName}: expected 8-bit RGB/RGBA PNG, got bit depth ${bitDepth}, color type ${colorType}`
    );
  if (colorType === 2) return { width, height };
  const scanlines = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  let previous = Buffer.alloc(stride);
  let position = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = scanlines[position++];
    const row = Buffer.from(scanlines.subarray(position, position + stride));
    position += stride;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= 4 ? row[x - 4] : 0;
      const up = previous[x];
      const upperLeft = x >= 4 ? previous[x - 4] : 0;
      if (filter === 1) row[x] = (row[x] + left) & 255;
      else if (filter === 2) row[x] = (row[x] + up) & 255;
      else if (filter === 3) row[x] = (row[x] + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) {
        const estimate = left + up - upperLeft;
        const distanceLeft = Math.abs(estimate - left);
        const distanceUp = Math.abs(estimate - up);
        const distanceUpperLeft = Math.abs(estimate - upperLeft);
        const predictor =
          distanceLeft <= distanceUp && distanceLeft <= distanceUpperLeft
            ? left
            : distanceUp <= distanceUpperLeft
              ? up
              : upperLeft;
        row[x] = (row[x] + predictor) & 255;
      } else if (filter !== 0)
        throw new Error(`${fileName}: unsupported PNG filter ${filter}`);
    }
    for (let x = 3; x < stride; x += 4)
      if (row[x] !== 255)
        throw new Error(`${fileName}: unexpected transparency at row ${y}`);
    previous = row;
  }
  return { width, height };
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

for (const size of expected) {
  const fileName = `house-todo-v2-${size}.png`;
  const filePath = path.join(iconDir, fileName);
  if (!existsSync(filePath)) throw new Error(`${fileName}: missing`);
  const { width, height } = parsePng(await readFile(filePath), fileName);
  if (width !== size || height !== size)
    throw new Error(`${fileName}: expected ${size}x${size}, got ${width}x${height}`);
}

for (const source of manifest.icons.map((icon) => icon.src)) {
  if (
    !source.endsWith(".png") ||
    !existsSync(path.join(root, "public", source.slice(1)))
  )
    throw new Error(`manifest icon is missing or not PNG: ${source}`);
}
const indexHtml = await readFile(path.join(root, "index.html"), "utf8");
const appleMatch = indexHtml.match(/<link\s+rel="apple-touch-icon"[^>]*href="([^"]+)"/);
if (!appleMatch || appleMatch[1] !== "/icons/house-todo-v2-180.png")
  throw new Error(
    "index.html: apple-touch-icon does not point to the refreshed 180px asset"
  );
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
}

console.log(
  `PWA icon validation passed: ${expected.map((size) => `${size}x${size}`).join(", ")}; manifest/apple-touch/runtime references verified.`
);
