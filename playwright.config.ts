import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

// The tests sign in to admin with the same ADMIN_PASSWORD the app reads
// from the root .env; values already in the environment win, as in CI.
try {
  process.loadEnvFile(path.resolve(import.meta.dirname, ".env"));
} catch {
  /* no .env: the tests fall back to e2e-password */
}

/**
 * The kiosk's happy path against the real app, worker and Postgres,
 * over the same HTTPS the iPad uses. Both processes are started here
 * when they are not already running, so `pnpm e2e` works from a cold
 * checkout once `docker compose up -d` has a database.
 */
const BASE_URL = process.env.BOOTH_URL ?? "https://localhost:3100";
/** The worker's health endpoint; WORKER_PORT moves it when another stack holds 3101. */
const WORKER_URL = process.env.WORKER_URL ?? "http://localhost:3101/health";

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
  // Started in order, each once the one before answers. The worker goes
  // first because it migrates and seeds, and the app's snapshot fails
  // until the seed has made the booth row.
  webServer: [
    {
      command: "pnpm --filter @booth/worker start",
      url: WORKER_URL,
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: "pnpm --filter @booth/booth dev",
      url: `${BASE_URL}/api/snapshot`,
      ignoreHTTPSErrors: true,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
