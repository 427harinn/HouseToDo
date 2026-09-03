import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const finalDir = path.resolve(__dirname, "..");
const appStoreDir = path.resolve(finalDir, "..");
const repoDir = path.resolve(appStoreDir, "..", "..");

const WIDTH = 1320;
const HEIGHT = 2868;
const SCREENSHOT_WIDTH = 900;
const screenshotTop = 660;

const pages = [
  {
    page: 1,
    output: "01-home.png",
    background: "screenimage/1.png",
    screenshot: "raw/screenshots/home/home-assignees.png",
    copy: "今日やることが\n一目でわかる",
  },
  {
    page: 2,
    output: "02-complete.png",
    background: "screenimage/2.png",
    screenshot: "raw/screenshots/home/home-task-expanded.png",
    copy: "タップして\nそのまま完了",
  },
  {
    page: 3,
    output: "03-swipe.png",
    background: "screenimage/3.png",
    screenshot: "raw/screenshots/home/home-swipe-actions.png",
    copy: "スワイプで\n編集やパス",
  },
  {
    page: 4,
    output: "04-task-settings.png",
    background: "screenimage/4.png",
    screenshot: "raw/screenshots/task-form/task-form-time-notification.png",
    copy: "家事に合わせて\n細かく決める",
  },
  {
    page: 5,
    output: "05-repeat.png",
    background: "screenimage/5.png",
    screenshot: "raw/screenshots/task-form/task-repeat-options.png",
    copy: "毎週じゃない予定も\n入れやすい",
  },
  {
    page: 6,
    output: "06-calendar.png",
    background: "screenimage/6.png",
    screenshot: "raw/screenshots/calendar/calendar-date-sheet.png",
    copy: "予定と家事を\nまとめて見られる",
  },
  {
    page: 7,
    output: "07-shopping.png",
    background: "screenimage/7.png",
    screenshot: "raw/screenshots/shopping/shopping-photo-memo.png",
    copy: "買い物も一緒にわかる",
  },
  {
    page: 8,
    output: "08-notifications.png",
    background: "screenimage/8.png",
    screenshot: "raw/screenshots/settings/settings-notifications.png",
    copy: "朝と夜に\nまとめてお知らせ",
  },
];

const annotations = {
  2: `
    <svg class="annotation annotation-complete" viewBox="0 0 320 310" aria-hidden="true">
      <path d="M286 24 C226 28 183 52 183 102 C184 147 143 168 113 190 C76 217 62 253 54 288" />
      <path d="M54 288 L51 256 M54 288 L82 276" />
      <path class="echo" d="M291 29 C234 33 189 58 190 105" />
    </svg>
  `,
  3: `
    <div class="annotation-note swipe-note">
      <span>スワイプ</span>
      <svg viewBox="0 0 240 110" aria-hidden="true">
        <path d="M220 55 C174 48 126 48 72 53 C57 54 42 57 20 61" />
        <path d="M20 61 L52 43 M20 61 L54 74" />
        <path class="echo" d="M220 63 C165 56 113 58 63 64" />
      </svg>
    </div>
  `,
  4: `
    <div class="annotation-note notification-note">
      <span>通知も</span>
      <svg viewBox="0 0 300 260" aria-hidden="true">
        <path d="M28 120 C35 43 104 18 185 32 C267 46 288 103 273 166 C258 226 184 245 106 233 C48 224 20 188 28 120 Z" />
        <path d="M274 166 C288 181 294 194 291 214" />
        <path d="M291 214 L273 196 M291 214 L268 218" />
        <path class="echo" d="M40 121 C47 52 106 31 178 43" />
      </svg>
    </div>
  `,
  5: `
    <svg class="annotation annotation-repeat" viewBox="0 0 1000 390" aria-hidden="true">
      <path d="M65 66 C178 26 325 46 466 39 C631 30 791 38 918 79 C976 98 975 152 929 190 C858 249 724 261 572 266 C409 272 250 286 128 267 C42 254 18 197 49 149 C62 129 72 103 65 66 Z" />
      <path class="echo" d="M83 76 C211 44 340 61 467 56 C634 49 786 53 903 89" />
    </svg>
  `,
  6: `
    <svg class="annotation annotation-calendar" viewBox="0 0 880 900" aria-hidden="true">
      <path d="M44 300 C152 311 247 303 352 307 C447 311 555 315 665 303" />
      <path d="M55 750 C164 760 269 753 377 758 C490 764 605 764 716 752" />
      <path class="echo" d="M47 307 C144 318 250 311 346 314" />
    </svg>
  `,
  7: `
    <div class="annotation-note shopping-note">
      <span>写真もメモも</span>
      <svg viewBox="0 0 330 270" aria-hidden="true">
        <path d="M35 112 C45 38 121 20 205 35 C282 49 317 107 296 177 C276 241 193 259 112 244 C52 233 26 185 35 112 Z" />
        <path d="M296 177 C311 194 318 212 308 231" />
        <path d="M308 231 L286 215 M308 231 L283 237" />
        <path class="echo" d="M49 111 C59 49 125 35 197 48" />
      </svg>
    </div>
  `,
};

function escapeHtml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function dataUrl(buffer, mimeType) {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

async function pageHtml(page, fontFaceCss) {
  const [backgroundBuffer, screenshotBuffer] = await Promise.all([
    fs.readFile(path.resolve(appStoreDir, page.background)),
    fs.readFile(path.resolve(appStoreDir, page.screenshot)),
  ]);
  const copy = escapeHtml(page.copy).replaceAll("\n", "<br />");
  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=${WIDTH}, initial-scale=1" />
    <style>
      ${fontFaceCss}
      :root {
        --ink: #303531;
        --green: #4e9f7d;
      }
      * { box-sizing: border-box; }
      html, body { margin: 0; width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; background: #f9f7f2; }
      body { position: relative; color: var(--ink); }
      .canvas { position: relative; width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; }
      .background { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: fill; display: block; }
      .copy {
        position: absolute;
        z-index: 2;
        top: 168px;
        left: 120px;
        width: 1080px;
        font-family: "Zen Kaku Gothic New", sans-serif;
        font-size: 96px;
        font-weight: 700;
        line-height: 1.24;
        letter-spacing: -0.045em;
        color: var(--ink);
      }
      .screenshot {
        position: absolute;
        z-index: 1;
        top: ${screenshotTop}px;
        left: ${(WIDTH - SCREENSHOT_WIDTH) / 2}px;
        width: ${SCREENSHOT_WIDTH}px;
        height: auto;
        display: block;
        border: 2px solid rgba(229, 231, 226, 0.85);
        border-radius: 40px;
        box-shadow: 0 24px 70px rgba(48, 53, 49, 0.1);
      }
      .annotation-layer { position: absolute; inset: 0; z-index: 3; pointer-events: none; }
      .annotation { position: absolute; overflow: visible; fill: none; stroke: var(--green); stroke-width: 6; stroke-linecap: round; stroke-linejoin: round; opacity: 0.84; }
      .annotation .echo, .annotation-note .echo { stroke-width: 3.5; opacity: 0.42; }
      .annotation-complete { left: 820px; top: 900px; width: 320px; height: 310px; }
      .annotation-repeat { left: 160px; top: 2330px; width: 1000px; height: 390px; stroke-width: 5.5; opacity: 0.72; }
      .annotation-calendar { left: 250px; top: 1115px; width: 880px; height: 900px; stroke-width: 5; opacity: 0.56; }
      .annotation-note { position: absolute; color: var(--green); font-family: "Yomogi", cursive; font-weight: 400; font-size: 46px; line-height: 1; opacity: 0.9; }
      .annotation-note > span { position: absolute; white-space: nowrap; z-index: 1; }
      .annotation-note svg { position: absolute; overflow: visible; fill: none; stroke: var(--green); stroke-width: 5; stroke-linecap: round; stroke-linejoin: round; }
      .swipe-note { left: 880px; top: 760px; width: 330px; height: 150px; transform: rotate(-3deg); }
      .swipe-note > span { top: 0; right: 0; }
      .swipe-note svg { left: -90px; top: 56px; width: 240px; height: 110px; }
      .notification-note { left: 885px; top: 1770px; width: 330px; height: 290px; transform: rotate(3deg); font-size: 42px; }
      .notification-note > span { top: 84px; left: 100px; }
      .notification-note svg { inset: 0; width: 300px; height: 260px; }
      .shopping-note { left: 780px; top: 1160px; width: 360px; height: 300px; transform: rotate(-2deg); font-size: 42px; }
      .shopping-note > span { top: 92px; left: 82px; }
      .shopping-note svg { inset: 0; width: 330px; height: 270px; }
    </style>
  </head>
  <body>
    <main class="canvas" data-page="${page.page}">
      <img class="background" src="${dataUrl(backgroundBuffer, "image/png")}" alt="" />
      <div class="copy">${copy}</div>
      <img class="screenshot" src="${dataUrl(screenshotBuffer, "image/png")}" alt="HouseToDo raw screenshot" />
      <div class="annotation-layer">${annotations[page.page] ?? ""}</div>
    </main>
  </body>
</html>`;
}

async function waitForAssets(page) {
  await page.waitForFunction(() => Array.from(document.images).every((image) => image.complete && image.naturalWidth > 0));
  await page.evaluate(async () => {
    await document.fonts.ready;
    const zen = await document.fonts.load('700 96px "Zen Kaku Gothic New"', "今日やること");
    const yomogi = await document.fonts.load('400 46px Yomogi', "スワイプ");
    if (!zen.length) throw new Error("Zen Kaku Gothic New failed to load");
    if (!yomogi.length) throw new Error("Yomogi failed to load");
  });
}

async function renderContactSheet(browser) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 2000 }, deviceScaleFactor: 1 });
  const cards = (await Promise.all(pages.map(async (item) => {
    const buffer = await fs.readFile(path.resolve(finalDir, "screenshots", item.output));
    return `<figure><img src="${dataUrl(buffer, "image/png")}" alt="Page ${item.page}" /><figcaption>Page ${item.page}</figcaption></figure>`;
  }))).join("");
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; } html, body { margin: 0; background: #f4f1e9; } body { padding: 28px; font-family: sans-serif; color: #303531; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px; } figure { margin: 0; } img { display: block; width: 100%; height: auto; border-radius: 16px; box-shadow: 0 8px 24px rgba(48,53,49,.12); } figcaption { padding: 8px 4px 0; font-size: 15px; }
  </style></head><body><div class="grid">${cards}</div></body></html>`, { waitUntil: "load" });
  await page.waitForFunction(() => Array.from(document.images).every((image) => image.complete && image.naturalWidth > 0));
  await page.screenshot({ path: path.resolve(finalDir, "preview", "contact-sheet.png"), fullPage: true, type: "png" });
  await page.close();
}

async function main() {
  const previewOnly = process.argv.includes("--preview-only");
  const outputDir = path.resolve(finalDir, "screenshots");
  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(path.resolve(finalDir, "preview"), { recursive: true });

  const browser = await chromium.launch({ headless: true });
  try {
    if (!previewOnly) {
      const [zenFont, yomogiFont] = await Promise.all([
        fs.readFile(path.resolve(repoDir, "node_modules/@fontsource/zen-kaku-gothic-new/files/zen-kaku-gothic-new-japanese-700-normal.woff2")),
        fs.readFile(path.resolve(repoDir, "node_modules/@fontsource/yomogi/files/yomogi-japanese-400-normal.woff2")),
      ]);
      const fontFaceCss = `
        @font-face { font-family: "Zen Kaku Gothic New"; font-style: normal; font-weight: 700; font-display: block; src: url("${dataUrl(zenFont, "font/woff2")}") format("woff2"); }
        @font-face { font-family: "Yomogi"; font-style: normal; font-weight: 400; font-display: block; src: url("${dataUrl(yomogiFont, "font/woff2")}") format("woff2"); }
      `;
      const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
      for (const item of pages) {
        console.log(`Rendering ${item.output}`);
        await page.setContent(await pageHtml(item, fontFaceCss), { waitUntil: "load" });
        await waitForAssets(page);
        await page.screenshot({ path: path.resolve(outputDir, item.output), type: "png" });
      }
      await page.close();
    }
    await renderContactSheet(browser);
  } finally {
    await browser.close();
  }
  console.log(`${previewOnly ? "Preview updated" : `Rendered ${pages.length} App Store screenshots`} in ${finalDir}`);
}

await main();
