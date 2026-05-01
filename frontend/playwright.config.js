// Playwright config — runs E2E tests against the deployed preview URL.
// Lance avec: `yarn test:e2e`
const { defineConfig, devices } = require('@playwright/test');
require('dotenv').config({ path: '.env' });

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || process.env.REACT_APP_BACKEND_URL;
if (!BASE_URL) throw new Error('PLAYWRIGHT_BASE_URL ou REACT_APP_BACKEND_URL requis');

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'tests/e2e/report' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 8_000,
    navigationTimeout: 20_000,
  },
  projects: [
    {
      name: 'desktop-chrome',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 5'] },
    },
  ],
});
