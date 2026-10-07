import { defineConfig, devices } from "@playwright/test";

/**
 * The kiosk's happy path against the real app, worker and Postgres,
 * over the same HTTPS the iPad uses. Both processes are started here
 * when they are not already running, so `pnpm e2e` works from a cold
 * checkout once `docker compose up -d` has a database.
 */
const BASE_URL = process.env.BOOTH_URL ?? "https://localhost:3100";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/test-results",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { outputFolder: "e2e/playwright-report", open: "never" }]],
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE_URL,
    ignoreHTTPSErrors: true,
    trace: "retain-on-failure",
    ...devices["iPad Pro 11 landscape"],
  },
  webServer: [
    {
      command: "pnpm --filter @booth/booth dev",
      url: `${BASE_URL}/api/snapshot`,
      ignoreHTTPSErrors: true,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "pnpm --filter @booth/worker start",
      url: "http://localhost:3101/health",
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
