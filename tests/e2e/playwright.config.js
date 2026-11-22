// Run through `npm run test:e2e` (scripts/test-e2e.mjs): it builds the app, starts it on the TEST database and
// sets BASE_URL / DATABASE_URL. Never point this at production.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.js',
  // Quarantined tests (tagged @quarantine, each with the reason next to it) are skipped unless RUN_QUARANTINE=1.
  grepInvert: process.env.RUN_QUARANTINE ? undefined : /@quarantine/,
  fullyParallel: true,
  workers: 4,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 10_000 }, // the database is remote, so give pages a little room
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.BASE_URL,
    actionTimeout: 10_000,
    locale: 'en-US',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }],
});
