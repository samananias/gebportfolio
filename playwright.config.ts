import { defineConfig, devices } from "@playwright/test";

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import dotenv from 'dotenv';
// dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "./tests",
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Parallel worker allocation: 2 in CI and locally for dev server stability */
  workers: process.env.CI ? 2 : 2,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: "html",
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: "http://localhost:4321",

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "on-first-retry",
    /* Take screenshots on failure */
    screenshot: "only-on-failure",
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },

    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },

    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },

    /* Test against mobile viewports. */
    {
      name: "Mobile Chrome",
      use: { ...devices["Pixel 5"] },
    },
    {
      name: "Mobile Safari",
      use: { ...devices["iPhone 12"] },
    },
  ],

  /* Auto-start the app so tests can run without a manually started server.
     Boots adapterless `astro dev` (see astro.config.ts CF_DEV gate) bound to
     127.0.0.1 so the probe URL below always matches. `astro preview` is not
     used: `@astrojs/cloudflare` preview requires Wrangler Pages bindings that
     hang outside Wrangler environments. */
  webServer: {
    command: "pnpm exec astro dev --host 127.0.0.1 --port 4321",
    url: "http://127.0.0.1:4321",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      ...process.env,
      ASTRO_DEV_BACKGROUND: "1",
      // Disables the Astro dev toolbar (see astro.config.ts devToolbar gate):
      // its fixed overlay intercepts pointer events during E2E interactions.
      PLAYWRIGHT_E2E: "1",
      // Surface webServer output in CI logs so a future dev-boot hang shows
      // the server's stdout instead of failing silently at the timeout.
      DEBUG: "pw:webserver",
    },
  },
});
