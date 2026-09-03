import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const keyVisualDir = path.resolve(__dirname, "..");
const assetsDir = path.resolve(keyVisualDir, "assets");
const outputDir = path.resolve(keyVisualDir, "output");
const outputPath = path.resolve(outputDir, "key-visual-base-v2.png");
const previewDir = path.resolve(keyVisualDir, "preview");
const comparisonPath = path.resolve(previewDir, "key-visual-base-comparison.png");

const WIDTH = 2868;
const HEIGHT = 1320;

const screens = [
  {
    className: "shopping",
    fileName: "05-shopping.png",
    width: 500,
    left: 1210,
    top: 145,
    zIndex: 1,
  },
  {
    className: "calendar",
    fileName: "calendar-month.png",
    width: 500,
    left: 1935,
    top: 145,
    zIndex: 2,
  },
  {
    className: "home",
    fileName: "01-home.png",
    width: 565,
    left: 1540,
    top: 60,
    zIndex: 3,
  },
];

function dataUrl(buffer) {
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

async function readAsset(fileName) {
  return dataUrl(await fs.readFile(path.resolve(assetsDir, fileName)));
}

async function buildHtml() {
  const background = await readAsset("background.png");
  const screenData = await Promise.all(
    screens.map(async (screen) => ({ ...screen, src: await readAsset(screen.fileName) })),
  );

  const screenMarkup = screenData
    .map(
      (screen) => `
        <img
          class="screenshot screenshot-${screen.className}"
          src="${screen.src}"
          alt=""
          style="--screen-width: ${screen.width}px; --screen-left: ${screen.left}px; --screen-top: ${screen.top}px; --screen-z: ${screen.zIndex};"
        />`,
    )
    .join("");

  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=${WIDTH}, initial-scale=1" />
    <style>
      * { box-sizing: border-box; }
      html, body {
        width: ${WIDTH}px;
        height: ${HEIGHT}px;
        margin: 0;
        overflow: hidden;
        background: #faf8f3;
      }
      .canvas {
        position: relative;
        width: ${WIDTH}px;
        height: ${HEIGHT}px;
        overflow: hidden;
      }
      .background {
        position: absolute;
        inset: 0;
        display: block;
        width: 100%;
        height: 100%;
      }
      .screenshot {
        position: absolute;
        top: var(--screen-top);
        left: var(--screen-left);
        z-index: var(--screen-z);
        display: block;
        width: var(--screen-width);
        height: auto;
        border: 1px solid rgba(48, 53, 49, 0.06);
        border-radius: 28px;
        box-shadow: 0 20px 48px rgba(48, 53, 49, 0.11);
      }
    </style>
  </head>
  <body>
    <main class="canvas">
      <img class="background" src="${background}" alt="" />
      ${screenMarkup}
    </main>
  </body>
</html>`;
}

async function waitForAssets(page) {
  await page.waitForFunction(() =>
    Array.from(document.images).every((image) => image.complete && image.naturalWidth > 0),
  );
}

async function renderComparison(browser, currentBuffer, v2Buffer) {
  const page = await browser.newPage({ viewport: { width: 1500, height: 820 }, deviceScaleFactor: 1 });
  const current = dataUrl(currentBuffer);
  const v2 = dataUrl(v2Buffer);
  await page.setContent(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; background: #f4f1e9; }
      body { padding: 28px; color: #303531; font: 600 18px/1.2 sans-serif; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
      figure { margin: 0; }
      img { display: block; width: 100%; height: auto; border-radius: 12px; box-shadow: 0 8px 24px rgba(48, 53, 49, 0.12); }
      figcaption { padding: 10px 2px 0; }
    </style>
  </head>
  <body>
    <div class="grid">
      <figure><img src="${current}" alt="" /><figcaption>Current</figcaption></figure>
      <figure><img src="${v2}" alt="" /><figcaption>V2</figcaption></figure>
    </div>
  </body>
</html>`, { waitUntil: "load" });
  await waitForAssets(page);
  await fs.mkdir(previewDir, { recursive: true });
  await page.screenshot({ path: comparisonPath, type: "png", fullPage: true });
  await page.close();
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: WIDTH, height: HEIGHT },
      deviceScaleFactor: 1,
    });
    await page.setContent(await buildHtml(), { waitUntil: "load" });
    await waitForAssets(page);
    await page.screenshot({ path: outputPath, type: "png" });
    await page.close();
    const currentPath = path.resolve(outputDir, "key-visual-base.png");
    const currentBuffer = await fs.readFile(currentPath);
    const v2Buffer = await fs.readFile(outputPath);
    await renderComparison(browser, currentBuffer, v2Buffer);
  } finally {
    await browser.close();
  }
  console.log(`Rendered ${WIDTH}x${HEIGHT} key visual to ${outputPath}`);
  console.log(`Rendered comparison preview to ${comparisonPath}`);
}

await main();
