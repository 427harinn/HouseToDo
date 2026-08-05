import { defineConfig, devices } from "@playwright/test";

const baseUrl = process.env.STAGING_E2E_BASE_URL;
if (!baseUrl) throw new Error("STAGING_E2E_BASE_URL is required");

const parsed = new URL(baseUrl);
if (
  parsed.protocol !== "https:" ||
  parsed.hostname !== "house-to-do-staging.427harinn.workers.dev" ||
  parsed.pathname !== "/" ||
  parsed.username ||
  parsed.password ||
  parsed.search ||
  parsed.hash
) {
  throw new Error("staging E2E accepts only the exact staging workers.dev URL");
}
if (/production|prod/i.test(baseUrl)) throw new Error("production URL is forbidden");

const artifactDir =
  process.env.PLAYWRIGHT_ARTIFACT_DIR ?? "artifacts/playwright/staging-e2e-remaining";

console.log(`staging E2E target: ${parsed.origin}`);

export default defineConfig({
  testDir: "./e2e/staging",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  outputDir: `${artifactDir}/test-results`,
  reporter: [
    ["list"],
    ["html", { outputFolder: `${artifactDir}/html-report`, open: "never" }]
  ],
  use: {
    baseURL: parsed.origin,
    trace: "off",
    screenshot: "only-on-failure",
    video: "off",
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo"
  },
  projects: [{ name: "staging-chromium", use: { ...devices["Desktop Chrome"] } }]
});
