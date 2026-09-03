import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(repoRoot, "marketing", "app-store", "fixtures", "house-to-do.json");
const fixture = JSON.parse(await readFile(fixturePath, "utf8"));

const requiredAssets = [
  ...fixture.members.map((member) => member.avatar),
  ...fixture.shopping.pending.filter((item) => item.image).map((item) => item.image)
];
for (const relativePath of requiredAssets) await access(path.join(repoRoot, relativePath));

const requiredTaskTitles = ["ゴミ出し", "インコの餌交換", "お風呂掃除", "シーツ交換", "植物の水やり", "排水口の掃除"];
const actualTaskTitles = fixture.tasks.map((task) => task.title);
if (!requiredTaskTitles.every((title) => actualTaskTitles.includes(title))) {
  throw new Error("marketing fixture is missing a required task");
}
if (fixture.captureTime !== "2026-09-07T10:00:00+09:00") throw new Error("marketing fixture capture time changed");
if (fixture.household.timezone !== "Asia/Tokyo" || fixture.household.weekStartsOn !== 1) {
  throw new Error("marketing fixture household settings changed");
}

console.log(`Marketing fixture ready: ${fixture.household.name} / ${fixture.tasks.length} tasks / ${fixture.shopping.pending.length + fixture.shopping.purchased.length} shopping items`);
console.log(`Capture time: ${fixture.captureTime}; local API seed is owned by the marketing Playwright scenario.`);
