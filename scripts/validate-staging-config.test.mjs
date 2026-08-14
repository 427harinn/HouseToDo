import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { STAGING_CRON, validateStagingConfig } from "./validate-staging-config.mjs";

const config = readFileSync("wrangler.jsonc", "utf8");

describe("staging config validator", () => {
  it("accepts the configured staging Cron", () => {
    expect(validateStagingConfig(config)).toEqual([]);
  });

  it("rejects the obsolete staging Cron", () => {
    const oldCronConfig = config.replace(`"crons": ["${STAGING_CRON}"]`, '"crons": ["0 18 * * *"]');

    expect(validateStagingConfig(oldCronConfig)).toContain(`staging Cron must contain exactly one ${STAGING_CRON} UTC trigger`);
  });
});
