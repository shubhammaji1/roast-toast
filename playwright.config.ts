import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 180000,
  expect: { timeout: 20000 },
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  webServer: process.env.TEST_BASE_URL
    ? undefined
    : [
        {
          command: "node --import tsx tests/browser-server.ts",
          url: "http://localhost:4001/api/v1/health",
          reuseExistingServer: false,
          timeout: 120000,
        },
        {
          command: "node scripts/e2e-web.mjs",
          url: "http://localhost:3001",
          reuseExistingServer: false,
          timeout: 120000,
          env: {
            API_INTERNAL_URL: "http://127.0.0.1:4001",
            NEXT_DIST_DIR: ".next-e2e",
          },
        },
      ],
  use: {
    actionTimeout: 15000,
    baseURL: process.env.TEST_BASE_URL || "http://localhost:3001",
    headless: Boolean(process.env.CI),
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1440, height: 1000 },
    launchOptions: { args: ["--disable-dev-shm-usage"] },
  },
});
