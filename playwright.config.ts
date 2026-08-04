import { defineConfig, devices } from "@playwright/test";

const artifactDir = process.env.PLAYWRIGHT_ARTIFACT_DIR ?? "artifacts/playwright/shopping-ui";

export default defineConfig({
  testDir: "./e2e",
  timeout: 180_000,
  expect: {
    timeout: 10_000
  },
  fullyParallel: false,
  workers: 1,
  outputDir: `${artifactDir}/test-results`,
  reporter: [["list"], ["html", { outputFolder: `${artifactDir}/html-report`, open: "never" }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://app:5173",
    trace: "on",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
