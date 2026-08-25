import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

const evidence = fileURLToPath(new URL("../docs/evidence/m4/", import.meta.url));
const upload = `${evidence}/review-upload`;
const metadata = JSON.parse(await fs.readFile(`${evidence}/capture-metadata.json`, "utf8"));
const toDataUrl = async (relative) => `data:image/png;base64,${(await fs.readFile(`${evidence}/${relative}`)).toString("base64")}`;

const boards = [
  {
    file: "01-shopping-list-states.png",
    title: "01 Shopping list states",
    states: [
      ["normal", "production/01-shopping-normal.png", "mockup/01-shopping-normal.png"],
      ["planned-date", "production/02-shopping-planned-date.png", "mockup/02-shopping-planned-date.png"],
      ["no-planned-date", "production/03-shopping-no-planned-date.png", "mockup/03-shopping-no-planned-date.png"],
      ["many", "production/04-shopping-many.png", "mockup/04-shopping-many.png"],
      ["long-text", "production/05-shopping-long-text.png", "mockup/05-shopping-long-text.png"],
      ["empty", "production/06-shopping-empty.png", "mockup/06-shopping-empty.png"]
    ]
  },
  {
    file: "02-shopping-item-purchase-states.png",
    title: "02 Shopping item / purchase states",
    states: [
      ["expanded", "production/07-shopping-expanded.png", "mockup/07-shopping-expanded.png"],
      ["photo", "production/08-shopping-photo.png", "mockup/08-shopping-photo.png"],
      ["quantity-empty", "production/09-shopping-quantity-empty.png", "mockup/09-shopping-quantity-empty.png"],
      ["purchased-open", "production/10-shopping-purchased-open.png", "mockup/10-shopping-purchased-open.png"],
      ["purchased-auto-filtered", "production/11-shopping-purchased-auto-filtered.png", "mockup/11-shopping-purchased-auto-filtered.png"],
      ["deleted", "production/12-shopping-deleted.png", "mockup/12-shopping-deleted.png"]
    ]
  },
  {
    file: "03-shopping-add-reuse.png",
    title: "03 Shopping Add / reuse",
    states: [
      ["shopping-add normal", "production/13-shopping-add-normal.png", "mockup/13-shopping-add-normal.png"],
      ["reuse-picker", "production/14-shopping-reuse-picker.png", "mockup/14-shopping-reuse-picker.png"],
      ["reuse-selected", "production/15-shopping-reuse-selected.png", "mockup/15-shopping-reuse-selected.png"],
      ["reuse-no-photo-selected", "production/16-shopping-reuse-no-photo-selected.png", "mockup/16-shopping-reuse-no-photo-selected.png"],
      ["photo-selected", "production/17-shopping-photo-selected.png", "mockup/17-shopping-photo-selected.png"],
      ["long-text", "production/18-shopping-add-long-text.png", "mockup/18-shopping-add-long-text.png"]
    ]
  },
  {
    file: "04-shopping-edit-integrations.png",
    title: "04 Shopping Edit / integrations",
    states: [
      ["shopping-edit normal", "production/19-shopping-edit-normal.png", "mockup/19-shopping-edit-normal.png"],
      ["delete-confirm", "production/20-shopping-delete-confirm.png", "mockup/20-shopping-delete-confirm.png"]
    ]
  }
];

await fs.rm(upload, { recursive: true, force: true });
await fs.mkdir(upload, { recursive: true });
const browser = await chromium.launch({ headless: true });
for (const board of boards) {
  const page = await browser.newPage({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 1 });
  const rows = await Promise.all(board.states.map(async ([label, productionPath, mockupPath]) => {
    const [production, mockup] = await Promise.all([toDataUrl(productionPath), toDataUrl(mockupPath)]);
    return `<section><h2>${label}</h2><div class="pair"><figure><figcaption>Production</figcaption><img src="${production}" alt="Production ${label}"></figure><figure><figcaption>Mockup</figcaption><img src="${mockup}" alt="Mockup ${label}"></figure></div><p class="source">Evidence source: ${productionPath} · ${mockupPath}</p></section>`;
  }));
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>html{background:#eef2ef}body{margin:0;padding:24px;font-family:Arial,"Hiragino Kaku Gothic ProN",sans-serif;color:#18362d}header{margin-bottom:18px}h1{font-size:24px;margin:0 0 8px}header p,.source{margin:0;color:#61766d;font-size:11px;line-height:1.5}section{margin:0 0 20px;padding:14px;background:#fff;border:1px solid #cbd9d2;border-radius:12px}h2{font-size:15px;margin:0 0 9px}.pair{display:flex;gap:14px;align-items:flex-start}figure{margin:0;width:calc(50% - 7px)}figcaption{font-size:11px;font-weight:700;margin:0 0 5px;color:#557064}img{display:block;width:100%;height:auto;border:1px solid #d6e0db}.source{margin-top:7px}</style><header><h1>${board.title}</h1><p>Production render target SHA: ${metadata.productionSha} · Mockup SHA: ${metadata.mockupSha} · Viewport: 390×844</p></header>${rows.join("")}`, { waitUntil: "load" });
  await page.waitForFunction("Array.from(document.images).every((image) => image.complete)");
  await page.screenshot({ path: `${upload}/${board.file}`, fullPage: true });
  await page.close();
}
await browser.close();
for (const name of ["shopping-expand-collapse", "shopping-purchase-restore", "shopping-swipe-edit", "shopping-reorder"]) await fs.copyFile(`${evidence}/motion/${name}.webm`, `${upload}/${name}.webm`);
console.log(`Created ${boards.length} boards and 4 canonical WebM files in ${upload} from Production ${metadata.productionSha} / Mockup ${metadata.mockupSha}`);
