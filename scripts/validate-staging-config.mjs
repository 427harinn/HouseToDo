import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const STAGING_CRON = "*/5 * * * *";

export const validateStagingConfig = (config) => {
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
  try {
    const parsed = JSON.parse(config);
    const staging = parsed.env?.staging;
    const stagingCrons = staging?.triggers?.crons ?? [];
    const stagingCronMatches = stagingCrons.filter((cron) => cron === STAGING_CRON);
    if (stagingCronMatches.length !== 1 || stagingCrons.length !== 1) {
      failures.push(`staging Cron must contain exactly one ${STAGING_CRON} UTC trigger`);
    }
    const production = parsed.env?.production;
    if (production) {
      const productionD1 = production.d1_databases?.find(({ binding }) => binding === "DB");
      const productionR2 = production.r2_buckets?.find(({ binding }) => binding === "ATTACHMENTS");
      if (production.name === "house-to-do-staging") failures.push("staging and production Worker names must differ");
      if (productionD1?.database_name === "house-to-do-staging") failures.push("staging and production D1 databases must differ");
      if (productionR2?.bucket_name === "house-to-do-attachments-staging") failures.push("staging and production R2 buckets must differ");
    }
  } catch {
    failures.push("Wrangler configuration is not valid JSONC without comments");
  }

  return failures;
};

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const config = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
  const failures = validateStagingConfig(config);
  if (failures.length > 0) {
    console.error("Staging config is not deployable:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
  } else {
    console.log("Staging config is deployable.");
  }
}
