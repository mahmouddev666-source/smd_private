import {defineConfig, devices} from '@playwright/test';

const PORT = Number(process.env.PORT || 3000);

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html', {open: 'never'}]],
  timeout: 30_000,
  expect: {timeout: 10_000},
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // Use the full Chromium build (already installed) instead of the headless shell.
    channel: 'chromium',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'ar-EG',
    viewport: {width: 1440, height: 900},
  },
  projects: [
    {
      name: 'chromium',
      use: {...devices['Desktop Chrome'], locale: 'ar-EG'},
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
