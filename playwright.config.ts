import { defineConfig, devices } from "@playwright/test";
import { e2eDatabaseUrl } from "./e2e/database";

/**
 * End-to-end tests: the real app (Next.js server + browser) on a throwaway
 * local PostgreSQL. Run with
 *   E2E_DATABASE_URL=postgres://…@127.0.0.1:5432/kosh_e2e npm run test:e2e
 * The server runs with NODE_ENV=test, so Next.js does not read .env.local:
 * no live database, email, SMS or model keys reach it.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    // PLAYWRIGHT_CHANNEL=chrome uses an installed Google Chrome instead of Playwright's Chromium.
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next dev --port ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: {
      NODE_ENV: "test",
      NEXT_PUBLIC_API_MODE: "supabase",
      DATABASE_URL: e2eDatabaseUrl(),
      AUTH_JWT_SECRET: "e2e-only-secret-not-used-anywhere-else-0123456789",
      OTP_SHOW_CODES: "true",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
