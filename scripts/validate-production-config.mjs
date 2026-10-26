import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const PRODUCTION_CRON = "*/5 * * * *";
export const PRODUCTION_HOST = "https://house-to-do.427harinn.workers.dev";

export const validateProductionConfig = (source) => {
  const failures = [];
  let config;
  try {
    config = JSON.parse(source);
  } catch {
    return ["Wrangler configuration is not valid JSONC without comments"];
  }

  const production = config.env?.production;
  if (!production) return ["production environment is missing"];

  if (production.name !== "house-to-do") failures.push("production Worker name is not house-to-do");
  if (production.workers_dev !== true) failures.push("production workers_dev must be true");
  if (production.vars?.APP_ENV !== "production") failures.push("APP_ENV is not production");
  if (production.vars?.ALLOWED_ORIGINS !== PRODUCTION_HOST) failures.push("production ALLOWED_ORIGINS is not configured for the production host");
  if (production.vars?.OAUTH_ISSUER_URL !== PRODUCTION_HOST) failures.push("production OAUTH_ISSUER_URL is not configured for the production host");

  const assets = production.assets;
  if (assets?.directory !== "./dist/client") failures.push("production assets directory is not ./dist/client");
  if (assets?.binding !== "ASSETS") failures.push("production assets binding is not ASSETS");
  if (assets?.not_found_handling !== "single-page-application") failures.push("production SPA fallback is not configured");
  if (assets?.run_worker_first !== true) failures.push("production assets must run the Worker first for OAuth and MCP routes");

  const databases = production.d1_databases ?? [];
  const db = databases.find(({ binding }) => binding === "DB");
  if (databases.length !== 1 || !db) failures.push("production must define exactly one D1 binding named DB");
  if (db?.database_name !== "house-to-do") failures.push("production DB database_name is not house-to-do");
  if (db?.database_id === "00000000-0000-0000-0000-000000000000") failures.push("production DB must not use the repository dummy database ID");
  if (db?.database_id !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(db.database_id)) {
    failures.push("production DB database_id must be a valid D1 UUID when set");
  }
  if (db && db.migrations_dir !== "migrations") failures.push("production DB migrations_dir is not migrations");

  const buckets = production.r2_buckets ?? [];
  const attachments = buckets.find(({ binding }) => binding === "ATTACHMENTS");
  if (buckets.length !== 1 || !attachments) failures.push("production must define exactly one R2 binding named ATTACHMENTS");
  if (attachments?.bucket_name !== "house-to-do-attachments") failures.push("production ATTACHMENTS bucket is not house-to-do-attachments");

  const crons = production.triggers?.crons ?? [];
  if (crons.length !== 1 || crons[0] !== PRODUCTION_CRON) failures.push(`production Cron must contain exactly one ${PRODUCTION_CRON} UTC trigger`);

  const forbiddenPhaseOneNames = new Set(["AGENT_API_TOKEN", "AGENT_API_USER_ID"]);
  for (const name of forbiddenPhaseOneNames) {
    if (Object.hasOwn(production.vars ?? {}, name)) failures.push(`${name} must not be configured in production vars`);
    if ((production.secrets?.required ?? []).includes(name)) failures.push(`${name} must not be required in production secrets`);
  }
  if (production.name === config.env?.staging?.name) failures.push("staging and production Worker names must differ");
  if (db?.database_name === config.env?.staging?.d1_databases?.find(({ binding }) => binding === "DB")?.database_name) {
    failures.push("staging and production D1 databases must differ");
  }
  if (attachments?.bucket_name === config.env?.staging?.r2_buckets?.find(({ binding }) => binding === "ATTACHMENTS")?.bucket_name) {
    failures.push("staging and production R2 buckets must differ");
  }

  return failures;
};

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const config = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
  const failures = validateProductionConfig(config);
  if (failures.length > 0) {
    console.error("Production config validation failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
  } else {
    console.log("Production config matches the planned Worker, bindings, host, and Cron.");
    const parsed = JSON.parse(config);
    if (!parsed.env.production.d1_databases[0].database_id) {
      console.log("Production D1 database_id is intentionally unset until the D1 database is created; production deployment is not ready.");
    }
  }
}
