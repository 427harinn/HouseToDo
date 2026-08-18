import { defineConfig, devices } from "@playwright/test";

process.env.STAGING_E2E_PROJECT = "1";

const baseUrl = process.env.STAGING_E2E_BASE_URL;
let parsed: URL | null = null;
if (baseUrl) {
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error("STAGING_E2E_BASE_URL must be a valid URL");
  }
}

if (parsed && (
  parsed.protocol !== "https:" ||
  parsed.hostname !== "house-to-do-staging.427harinn.workers.dev" ||
  parsed.pathname !== "/" ||
  parsed.username ||
  parsed.password ||
  parsed.search ||
  parsed.hash
)) {
  throw new Error("staging E2E accepts only the exact staging workers.dev URL");
}
if (baseUrl && /production|prod/i.test(baseUrl)) throw new Error("production URL is forbidden");

const artifactDir =
  process.env.PLAYWRIGHT_ARTIFACT_DIR ?? "artifacts/playwright/staging-e2e-remaining";

console.log(
  parsed
    ? `staging E2E target: ${parsed.origin}`
    : "staging E2E skipped: STAGING_E2E_BASE_URL and staging credentials are not set"
);

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
    baseURL: parsed?.origin ?? "https://staging-e2e-not-configured.invalid",
    trace: "off",
    screenshot: "only-on-failure",
    video: "off",
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo"
  },
  projects: [{ name: "staging-chromium", use: { ...devices["Desktop Chrome"] } }]
});
