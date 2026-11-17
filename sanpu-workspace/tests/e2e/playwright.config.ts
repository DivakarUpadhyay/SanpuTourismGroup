import { defineConfig, devices } from "@playwright/test";

/** Real stack only: scripts/e2e.ps1 starts the APIs (5201/5202) on fresh *_E2E databases and production builds of the web apps (3201/3202).
 *  Uses the locally installed Google Chrome (channel "chrome") so no browser download is needed. */
export default defineConfig({
  testDir: ".",
  outputDir: "./results",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "./report", open: "never" }], ["json", { outputFile: "./results/results.json" }]],
  use: {
    channel: "chrome",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 10_000
  },
  projects: [
    { name: "erp", testMatch: /erp\..*spec\.ts/, use: { ...devices["Desktop Chrome"], channel: "chrome", baseURL: "http://localhost:3201" } },
    { name: "ai", testMatch: /ai\..*spec\.ts/, use: { ...devices["Desktop Chrome"], channel: "chrome", baseURL: "http://localhost:3202" } },
    // documentation screenshots of every screen (runs after the functional suites so detail pages have data)
    { name: "screens", testMatch: /screens\.spec\.ts/, dependencies: ["erp", "ai"], use: { ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 1280, height: 860 } } },
    // responsive audit of every screen at 360 / 768 / 1024 / 1440 px
    { name: "responsive", testMatch: /responsive\.spec\.ts/, dependencies: ["erp", "ai"], use: { ...devices["Desktop Chrome"], channel: "chrome" } }
  ]
});
