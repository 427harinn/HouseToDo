import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "docs", "design", "house-todo-app-icon.svg");
const iconDir = path.join(root, "public", "icons");
const artifactDir = path.join(root, "artifacts", "pwa-icon");
const svg = await readFile(sourcePath, "utf8");

await mkdir(iconDir, { recursive: true });
await mkdir(artifactDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ deviceScaleFactor: 1 });

async function renderIcon(size, filePath) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<!doctype html><style>html,body{margin:0;width:${size}px;height:${size}px;background:transparent;overflow:hidden}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`
  );
  await page.locator("svg").screenshot({ path: filePath, omitBackground: false });
}

for (const size of [180, 192, 512]) {
  await renderIcon(size, path.join(iconDir, `house-todo-v2-${size}.png`));
}

const iconData = {};
for (const size of [180, 512]) {
  const contents = await readFile(path.join(iconDir, `house-todo-v2-${size}.png`));
  iconData[size] = `data:image/png;base64,${contents.toString("base64")}`;
}

const previewPage = await browser.newPage({
  viewport: { width: 1440, height: 940 },
  deviceScaleFactor: 1
});
await previewPage.setContent(`<!doctype html>
<style>
  :root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 48px; background: #f1efe9; color: #303531; }
  h1 { margin: 0 0 8px; font-size: 30px; font-weight: 700; }
  p { margin: 0 0 34px; color: #647069; font-size: 16px; }
  .grid { display: grid; grid-template-columns: 1.1fr 1fr 1fr; gap: 24px; align-items: stretch; }
  .card { min-height: 360px; padding: 26px; border-radius: 26px; background: #fffdfa; box-shadow: 0 10px 24px rgba(48,53,49,.08); }
  .card h2 { margin: 0 0 18px; font-size: 17px; }
  .raw { display: grid; place-items: center; height: 280px; }
  .raw img { width: 280px; height: 280px; }
  .mask-stage { display: grid; place-items: center; height: 280px; }
  .masked { width: 220px; height: 220px; overflow: hidden; background: #8fd3b6; }
  .masked img { display: block; width: 100%; height: 100%; }
  .ios { border-radius: 24%; }
  .circle { border-radius: 50%; }
  .sizes { display: flex; justify-content: space-around; align-items: end; height: 280px; gap: 18px; }
  .size { display: grid; justify-items: center; gap: 10px; font-size: 14px; color: #647069; }
  .size img { display: block; width: var(--size); height: var(--size); }
  .caption { margin-top: 28px; padding: 16px 18px; border: 1px solid #d9e8df; border-radius: 16px; background: #f9fffb; font-size: 15px; line-height: 1.45; }
</style>
<h1>HouseToDo app icon refresh</h1>
<p>House + check · full-bleed mint background · mask-safe central glyph</p>
<main class="grid">
  <section class="card"><h2>A · Raw 512×512</h2><div class="raw"><img src="${iconData[512]}" alt="raw icon"></div></section>
  <section class="card"><h2>B · Simulated iOS mask</h2><div class="mask-stage"><div class="masked ios"><img src="${iconData[512]}" alt="iOS masked icon"></div></div></section>
  <section class="card"><h2>C · Simulated circular mask</h2><div class="mask-stage"><div class="masked circle"><img src="${iconData[512]}" alt="circular masked icon"></div></div></section>
  <section class="card"><h2>D · Small-size readability</h2><div class="sizes">
    <div class="size"><img style="--size:180px" src="${iconData[180]}" alt="180px icon"><span>180px</span></div>
    <div class="size"><img style="--size:60px" src="${iconData[180]}" alt="60px icon"><span>60px</span></div>
    <div class="size"><img style="--size:40px" src="${iconData[180]}" alt="40px icon"><span>40px</span></div>
  </div></section>
  <section class="card"><h2>E · Home Screen context</h2><div class="raw"><div class="masked ios" style="width:180px;height:180px"><img src="${iconData[512]}" alt="home screen icon"></div></div><div class="caption">Full square artwork lets the platform apply its own rounded or circular mask without transparent corners or a nested container.</div></section>
</main>`);
await previewPage.screenshot({
  path: path.join(artifactDir, "icon-contact-sheet.png"),
  fullPage: true
});
await previewPage
  .locator(".card:nth-child(4)")
  .screenshot({ path: path.join(artifactDir, "icon-small-size-preview.png") });
await previewPage
  .locator(".card:nth-child(2)")
  .screenshot({ path: path.join(artifactDir, "icon-ios-mask-preview.png") });

await browser.close();
console.log("Generated house-todo-v2 icons and PWA preview artifacts from", sourcePath);
