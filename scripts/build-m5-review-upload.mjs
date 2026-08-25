import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

const evidence = fileURLToPath(new URL("../docs/evidence/m5/", import.meta.url));
const upload = `${evidence}/review-upload`;
const metadata = JSON.parse(await fs.readFile(`${evidence}/capture-metadata.json`, "utf8"));
const toDataUrl = async (relative) => `data:image/png;base64,${(await fs.readFile(`${evidence}/${relative}`)).toString("base64")}`;

const boards = [
  { file: "01-other-members.png", title: "01 Other / Members", states: [
    ["other · normal", "01-other-normal"], ["members · normal", "02-members-normal"], ["members · invite-open", "03-members-invite-open"]
  ] },
  { file: "02-notifications.png", title: "02 Notifications", states: [
    ["notifications · normal", "04-notifications-normal"], ["notifications · device-off", "05-notifications-device-off"], ["notifications · morning-off", "06-notifications-morning-off"], ["notifications · all-schedule-off", "07-notifications-all-schedule-off"]
  ] },
  { file: "03-storage-household.png", title: "03 Storage / Household", states: [
    ["storage · normal", "08-storage-normal"], ["storage · near-limit", "09-storage-near-limit"], ["household · normal", "10-household-normal"], ["household · timezone-open", "11-household-timezone-open"], ["household · saved", "12-household-saved"]
  ] },
  { file: "04-account.png", title: "04 Account", states: [
    ["account · normal", "13-account-normal"], ["account · photo-selected", "14-account-photo-selected"], ["account · logout-confirm", "15-account-logout-confirm"]
  ] }
];

await fs.rm(upload, { recursive: true, force: true });
await fs.mkdir(upload, { recursive: true });
const browser = await chromium.launch({ headless: true });
for (const board of boards) {
  const page = await browser.newPage({ viewport: { width: 1240, height: 900 }, deviceScaleFactor: 1 });
  const rows = await Promise.all(board.states.map(async ([label, stem]) => {
    const productionPath = `production/${stem}.png`;
    const mockupPath = `mockup/${stem}.png`;
    const [production, mockup] = await Promise.all([toDataUrl(productionPath), toDataUrl(mockupPath)]);
    return `<section><h2>${label}</h2><div class="pair"><figure><figcaption>Production</figcaption><img src="${production}" alt="Production ${label}"></figure><figure><figcaption>Mockup</figcaption><img src="${mockup}" alt="Mockup ${label}"></figure></div><p class="source">Evidence source: ${productionPath} · ${mockupPath}</p></section>`;
  }));
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>html{background:#eef2ef}body{margin:0;padding:28px;font-family:Arial,"Hiragino Kaku Gothic ProN",sans-serif;color:#18362d}header{margin-bottom:18px}h1{font-size:26px;margin:0 0 8px}header p,.source{margin:0;color:#61766d;font-size:11px;line-height:1.5}section{margin:0 0 20px;padding:14px;background:#fff;border:1px solid #cbd9d2;border-radius:12px}h2{font-size:15px;margin:0 0 9px}.pair{display:flex;gap:14px;align-items:flex-start}figure{margin:0;width:calc(50% - 7px)}figcaption{font-size:11px;font-weight:700;margin:0 0 5px;color:#557064}img{display:block;width:100%;height:auto;border:1px solid #d6e0db}.source{margin-top:7px}</style><header><h1>${board.title}</h1><p>Production render target SHA: ${metadata.productionSha} · Mockup SHA: ${metadata.mockupSha} · Evidence viewport: 390×844</p></header>${rows.join("")}`, { waitUntil: "load" });
  await page.waitForFunction("Array.from(document.images).every((image) => image.complete)");
  await page.screenshot({ path: `${upload}/${board.file}`, fullPage: true });
  await page.close();
}
await browser.close();
for (const name of ["members-invite", "notifications-settings", "household-settings", "account-actions"]) await fs.copyFile(`${evidence}/motion/${name}.webm`, `${upload}/${name}.webm`);
console.log(`Created 4 review boards and 4 canonical WebM files in ${upload}`);
