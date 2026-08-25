import { chromium } from "@playwright/test";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const upload = new URL("../docs/evidence/m3/review-upload/", import.meta.url);
const mockupSha = "db8941dc3056f07862014242a349ae366da59e9c";

const readDataUrl = async (relativePath) => {
  const path = new URL(`../docs/evidence/m3/${relativePath}`, import.meta.url);
  const data = (await fs.readFile(path)).toString("base64");
  return `data:image/png;base64,${data}`;
};

const sourceSha = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();
await fs.rm(upload, { recursive: true, force: true });
await fs.mkdir(upload, { recursive: true });

const boards = [
  {
    file: "01-month-views.png",
    title: "01 Month views",
    states: [
      ["Calendar normal", "production/01-calendar-normal.png", "mockup/01-calendar-normal.png"],
      ["Calendar dense", "production/02-calendar-dense.png", "mockup/02-calendar-dense.png"],
      ["Calendar Shopping", "production/03-calendar-shopping.png", "mockup/03-calendar-shopping.png"],
      ["Calendar next month", "production/11-calendar-next-month.png", "mockup/11-calendar-next-month.png"]
    ]
  },
  {
    file: "02-date-sheet.png",
    title: "02 Date Sheet",
    states: [
      ["Date Sheet normal", "production/04-calendar-date-open.png", "mockup/04-calendar-date-open.png"],
      ["Date Sheet period + Shopping", "production/05-calendar-date-period-shopping.png", "mockup/05-calendar-date-period-shopping.png"],
      ["Completed collapsed", "production/06-calendar-completed-collapsed.png", "mockup/06-calendar-completed-collapsed.png"],
      ["Completed open", "production/07-calendar-completed-open.png", "mockup/07-calendar-completed-open.png"]
    ]
  },
  {
    file: "03-history-actions.png",
    title: "03 History actions",
    states: [
      ["Completed swipe", "production/08-calendar-completed-swipe.png", "mockup/08-calendar-completed-swipe.png"],
      ["Deleted completed restore-only", "production/09-calendar-deleted-completed-restore-only.png", "mockup/09-calendar-deleted-completed-restore-only.png"],
      ["After restore", "production/10-calendar-after-restore.png", "mockup/10-calendar-after-restore.png"]
    ]
  },
  {
    file: "04-task-edit-return-context.png",
    title: "04 Task edit return context (Production only)",
    states: [["Calendar → Task Edit return context", "production/12-calendar-task-edit-return-context.png", null]]
  }
];

const browser = await chromium.launch({ headless: true });
for (const board of boards) {
  const page = await browser.newPage({ viewport: { width: 820, height: 900 }, deviceScaleFactor: 1 });
  const rows = await Promise.all(board.states.map(async ([label, productionPath, mockupPath]) => {
    const production = await readDataUrl(productionPath);
    const mockup = mockupPath ? await readDataUrl(mockupPath) : "";
    return `<section><h2>${label}</h2><div class="pair"><figure><figcaption>Production</figcaption><img src="${production}" alt="Production ${label}"></figure>${mockup ? `<figure><figcaption>Mockup</figcaption><img src="${mockup}" alt="Mockup ${label}"></figure>` : ""}</div></section>`;
  }));
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>html{background:#eef1ef}body{margin:0;padding:24px;font-family:Arial,sans-serif;color:#18362d}header{margin-bottom:20px}h1{font-size:24px;margin:0 0 8px}p{margin:0;color:#557064;font-size:12px}section{margin:0 0 24px;padding:16px;background:#fff;border:1px solid #cbd9d2;border-radius:12px}h2{font-size:16px;margin:0 0 10px}.pair{display:flex;gap:16px;align-items:flex-start}figure{margin:0;width:calc(50% - 8px)}figcaption{font-size:12px;font-weight:700;margin:0 0 5px;color:#557064}img{display:block;width:100%;height:auto;border:1px solid #d6e0db}</style><header><h1>${board.title}</h1><p>Production HEAD: ${sourceSha} · Mockup SHA: ${mockupSha} · Evidence generation target SHA: ${sourceSha}</p></header>${rows.join("")}`, { waitUntil: "load" });
  await page.waitForFunction("Array.from(document.images).every((image) => image.complete)");
  await page.screenshot({ path: fileURLToPath(new URL(board.file, upload)), fullPage: true });
  await page.close();
}
await browser.close();

for (const file of [
  "calendar-task-complete.webm",
  "calendar-month-swipe.webm",
  "calendar-day-swipe.webm",
  "calendar-completed-undo.webm"
]) {
  await fs.copyFile(new URL(`../docs/evidence/m3/motion/${file}`, import.meta.url), new URL(file, upload));
}

console.log(`Created ${boards.length} review boards and 4 canonical WebM files in ${fileURLToPath(upload)}`);
