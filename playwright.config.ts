import { defineConfig, devices } from '@playwright/test';

const PORT = 4319;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1400, height: 900 },
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 900 } },
    },
  ],
  webServer: {
    command: `npm run build && rm -rf .e2e-data && NODE_ENV=production PORT=${PORT} DATA_DIR=.e2e-data NODE_OPTIONS=--disable-warning=ExperimentalWarning npx tsx apps/server/src/index.ts`,
    url: `http://localhost:${PORT}/api/me`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
