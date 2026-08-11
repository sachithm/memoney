import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  // Serial execution only: the single-threaded Next dev server here cannot
  // sustain parallel browsers. Its server-only T212 client enforces a
  // module-level 5s rate limit between calls, so each `/` load fires 4
  // sequential requests; under N parallel browsers these queue up and blow the
  // 30s browser timeout ("session closed"). CI already pins 1 worker; non-CI
  // is pinned too for a stable, deterministic e2e run.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
