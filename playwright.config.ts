import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  // In CI: retry flaky tests twice. Locally: no retries for fast feedback.
  retries: process.env.CI ? 2 : 1,
  // In CI: single worker to avoid resource contention on ubuntu-latest.
  workers: process.env.CI ? 1 : 1,
  // Fail fast in CI if a test uses .only — prevents accidental partial runs.
  forbidOnly: !!process.env.CI,
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list'],
  ],
  use: {
    // CI E2E runs against the preview server (port 4173, serves dist/).
    // Local dev sessions can still hit the dev server by passing --base-url manually.
    baseURL: 'http://localhost:4173',
    headless: true,
    viewport: { width: 1440, height: 900 },
    video: 'off',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // webServer starts `npm run preview` so CI can serve the downloaded dist/ artifact.
  // In local dev, reuse an already-running server rather than starting a new one.
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
