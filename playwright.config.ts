import { defineConfig, devices } from "@playwright/test";

/**
 * Release accessibility matrix. The test suite owns browser-visible evidence;
 * the manual device/AT record lives in docs/delivery/accessibility-checklist.md.
 * See PRD-NFR-002, PRD-NFR-005, UX-040, and TEST-005.
 */
export default defineConfig({
  testDir: "./apps/web/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100",
    trace: "on-first-retry",
  },
  webServer: {
    // Production output avoids the Next dev compiler's optional MongoDB
    // dependency warnings while testing the same artifact shipped to users.
    command:
      "BLOCKPARTY_LOCAL_HTTP_TEST=1 NEXT_PUBLIC_POSTHOG_KEY=phc_browser_test NEXT_PUBLIC_POSTHOG_HOST=http://127.0.0.1:3100 pnpm run build && BLOCKPARTY_LOCAL_HTTP_TEST=1 NEXT_PUBLIC_POSTHOG_KEY=phc_browser_test NEXT_PUBLIC_POSTHOG_HOST=http://127.0.0.1:3100 pnpm --filter @blockparty/web start --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
