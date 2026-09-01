import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "docs", "design", "house-todo-app-icon.svg");
const iconDir = path.join(root, "public", "icons");
const artifactDir = path.join(root, "artifacts", "pwa-icon");
const svg = await readFile(sourcePath, "utf8");
const maskableSvg = svg.replace("scale(1.12)", "scale(1)");

await mkdir(iconDir, { recursive: true });
await mkdir(artifactDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ deviceScaleFactor: 1 });

async function renderIcon(size, filePath, sourceSvg = svg) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<!doctype html><style>html,body{margin:0;width:${size}px;height:${size}px;background:transparent;overflow:hidden}svg{display:block;width:${size}px;height:${size}px}</style>${sourceSvg}`
  );
  await page.locator("svg").screenshot({ path: filePath, omitBackground: false });
}

for (const size of [180, 192, 512]) {
  await renderIcon(size, path.join(iconDir, `house-todo-v3-${size}.png`));
}
for (const size of [192, 512]) {
  await renderIcon(
    size,
    path.join(iconDir, `house-todo-v3-maskable-${size}.png`),
    maskableSvg
  );
}

const iconData = {};
for (const version of ["v2", "v3", "v3-maskable"]) {
  iconData[version] = {};
  for (const size of version === "v3-maskable" ? [512] : [180, 512]) {
    const contents = await readFile(path.join(iconDir, `house-todo-${version}-${size}.png`));
    iconData[version][size] = `data:image/png;base64,${contents.toString("base64")}`;
  }
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
  .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; align-items: stretch; }
  .card { min-height: 330px; padding: 26px; border-radius: 26px; background: #fffdfa; box-shadow: 0 10px 24px rgba(48,53,49,.08); }
  .card h2 { margin: 0 0 18px; font-size: 17px; }
  .raw { display: grid; place-items: center; height: 250px; }
  .raw img { width: 250px; height: 250px; }
  .mask-stage { display: grid; place-items: center; height: 250px; }
  .masked { width: 200px; height: 200px; overflow: hidden; background: #8fd3b6; }
  .masked img { display: block; width: 100%; height: 100%; }
  .ios { border-radius: 24%; }
  .circle { border-radius: 50%; }
  .comparison { display: flex; justify-content: center; align-items: end; gap: 34px; height: 250px; }
  .compare-item { display: grid; justify-items: center; gap: 10px; color: #647069; font-size: 14px; }
  .compare-item .masked { width: 60px; height: 60px; }
  .sizes { display: flex; justify-content: space-around; align-items: end; height: 250px; gap: 18px; }
  .size { display: grid; justify-items: center; gap: 10px; font-size: 14px; color: #647069; }
  .size img { display: block; width: var(--size); height: var(--size); }
  .mask-pair { display: flex; justify-content: center; gap: 36px; align-items: end; height: 250px; }
  .mask-pair .mask-item { display: grid; gap: 10px; justify-items: center; color: #647069; font-size: 14px; }
  .mask-pair .masked { width: 180px; height: 180px; }
  .mask-trio { display: flex; justify-content: center; gap: 20px; align-items: end; height: 250px; }
  .mask-trio .mask-item { display: grid; gap: 10px; justify-items: center; color: #647069; font-size: 13px; }
  .mask-trio .masked { width: 150px; height: 150px; }
  .caption { margin-top: 28px; padding: 16px 18px; border: 1px solid #d9e8df; border-radius: 16px; background: #f9fffb; font-size: 15px; line-height: 1.45; }
</style>
<h1>HouseToDo app icon refresh</h1>
<p>v2 → v3 · enlarged house + check · full-bleed mint background · mask-safe central glyph</p>
<main class="grid">
  <section class="card"><h2>A · iOS-sized comparison at 60px</h2><div class="comparison">
    <div class="compare-item"><div class="masked ios"><img src="${iconData.v2[180]}" alt="v2 iOS icon"></div><span>v2 · old</span></div>
    <div class="compare-item"><div class="masked ios"><img src="${iconData.v3[180]}" alt="v3 iOS icon"></div><span>v3 · new</span></div>
  </div><div class="caption">The mint tile reaches every corner; the comparison isolates the artwork scale change under the rounded-square mask.</div></section>
  <section class="card"><h2>B · Simulated iOS mask at 180px</h2><div class="mask-pair">
    <div class="mask-item"><div class="masked ios"><img src="${iconData.v2[512]}" alt="v2 iOS mask"></div><span>v2 · old</span></div>
    <div class="mask-item"><div class="masked ios"><img src="${iconData.v3[512]}" alt="v3 iOS mask"></div><span>v3 · new</span></div>
  </div></section>
  <section class="card"><h2>C · Circular mask safety</h2><div class="mask-trio">
    <div class="mask-item"><div class="masked circle"><img src="${iconData.v2[512]}" alt="v2 circular mask"></div><span>v2 · old</span></div>
    <div class="mask-item"><div class="masked circle"><img src="${iconData.v3[512]}" alt="v3 standard circular mask"></div><span>v3 · standard</span></div>
    <div class="mask-item"><div class="masked circle"><img src="${iconData["v3-maskable"][512]}" alt="v3 maskable circular mask"></div><span>v3 · maskable</span></div>
  </div></section>
  <section class="card"><h2>D · v3 small-size readability</h2><div class="sizes">
    <div class="size"><img style="--size:180px" src="${iconData.v3[180]}" alt="v3 180px icon"><span>180px</span></div>
    <div class="size"><img style="--size:60px" src="${iconData.v3[180]}" alt="v3 60px icon"><span>60px</span></div>
    <div class="size"><img style="--size:40px" src="${iconData.v3[180]}" alt="v3 40px icon"><span>40px</span></div>
  </div></section>
  <section class="card"><h2>E · Home Screen context</h2><div class="raw"><div class="masked ios" style="width:180px;height:180px"><img src="${iconData.v3[512]}" alt="v3 home screen icon"></div></div><div class="caption">Full-bleed mint remains visible to the platform mask. The v3 house and check are enlarged around the same optical center and remain inside the mask-safe area.</div></section>
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
console.log("Generated house-todo-v3 standard/maskable icons and comparison preview artifacts from", sourcePath);
