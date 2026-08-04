import { readFileSync } from "node:fs";

const config = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
const failures = [];
const has = (pattern) => pattern.test(config);
const stagingSection = config.split(/"staging"\s*:\s*\{/)[1] ?? "";
const stagingValueAfter = (label) => stagingSection.match(new RegExp(`\\"${label}\\"\\s*:\\s*\\"([^\\"]*)\\"`))?.[1] ?? "";

if (!has(/"env"\s*:\s*\{[\s\S]*"staging"\s*:/)) failures.push("staging environment is missing");
if (!has(/"name"\s*:\s*"house-to-do-staging"/)) failures.push("staging Worker name is not house-to-do-staging");
if (!has(/"binding"\s*:\s*"DB"[\s\S]*"database_name"\s*:\s*"house-to-do-staging"/)) failures.push("staging D1 binding or database name is missing");
const stagingId = stagingValueAfter("database_id");
if (!stagingId || stagingId.includes("__") || stagingId === "00000000-0000-0000-0000-000000000000") failures.push("D1 database ID is not configured");
if (!has(/"binding"\s*:\s*"ATTACHMENTS"[\s\S]*"bucket_name"\s*:\s*"house-to-do-attachments-staging"/)) failures.push("staging R2 binding or bucket name is missing");
if (!has(/"APP_ENV"\s*:\s*"staging"/)) failures.push("APP_ENV is not staging");
const origin = stagingValueAfter("ALLOWED_ORIGINS");
if (!origin || origin.includes("__") || origin === "*") failures.push("staging origin is not configured");
const stagingCronMatches = stagingSection.match(/"crons"\s*:\s*\[\s*"0 18 \* \* \*"\s*\]/g) ?? [];
if (stagingCronMatches.length !== 1) failures.push("staging Cron must contain exactly one 0 18 * * * UTC trigger");
if (/house-to-do-production|__PRODUCTION_/.test(config)) failures.push("production resource configuration must not be present");

if (failures.length > 0) {
  console.error("Staging config is not deployable:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("Staging config is deployable.");
}
