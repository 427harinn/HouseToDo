import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PRODUCTION_CRON, PRODUCTION_HOST, validateProductionConfig } from "./validate-production-config.mjs";

const config = JSON.parse(readFileSync("wrangler.jsonc", "utf8"));
const cloneConfig = () => JSON.parse(JSON.stringify(config));

describe("production config validator", () => {
  it("accepts the isolated production environment with its provisioned D1 ID", () => {
    expect(validateProductionConfig(JSON.stringify(config))).toEqual([]);
    expect(config.env.production.d1_databases[0].database_id).toBe("f4877c95-59c1-4e42-9684-5bc51d880aa4");
  });

  it("requires OAuth/MCP routes to run through the Worker before SPA fallback", () => {
    const broken = cloneConfig();
    broken.env.production.assets.run_worker_first = false;
    expect(validateProductionConfig(JSON.stringify(broken))).toContain("production assets must run the Worker first for OAuth and MCP routes");
  });

  it("requires a separate production D1 and R2 and the five-minute Cron", () => {
    const broken = cloneConfig();
    broken.env.production.d1_databases[0].database_name = broken.env.staging.d1_databases[0].database_name;
    broken.env.production.r2_buckets[0].bucket_name = broken.env.staging.r2_buckets[0].bucket_name;
    broken.env.production.triggers.crons = ["0 18 * * *"];
    const failures = validateProductionConfig(JSON.stringify(broken));
    expect(failures).toContain("staging and production D1 databases must differ");
    expect(failures).toContain("staging and production R2 buckets must differ");
    expect(failures).toContain(`production Cron must contain exactly one ${PRODUCTION_CRON} UTC trigger`);
  });

  it("uses the planned host and prohibits Phase 1 fixed bearer bindings", () => {
    const broken = cloneConfig();
    broken.env.production.vars.OAUTH_ISSUER_URL = "https://wrong.example";
    broken.env.production.vars.AGENT_API_TOKEN = "must-not-be-present";
    broken.env.production.secrets = { required: ["AGENT_API_USER_ID"] };
    const failures = validateProductionConfig(JSON.stringify(broken));
    expect(failures).toContain("production OAUTH_ISSUER_URL is not configured for the production host");
    expect(failures).toContain("AGENT_API_TOKEN must not be configured in production vars");
    expect(failures).toContain("AGENT_API_USER_ID must not be required in production secrets");
    expect(PRODUCTION_HOST).toBe("https://house-to-do.427harinn.workers.dev");
  });
});
