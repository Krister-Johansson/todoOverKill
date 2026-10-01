import { defineConfig, devices } from '@playwright/test'

import { loadDotEnv } from './src/lib/load-dot-env.ts'

// Variables exported in the shell win over .env, as in vite.config.ts.
loadDotEnv('test', process.cwd())

const testDatabaseUrl = process.env.DATABASE_URL_TEST
if (!testDatabaseUrl) {
  throw new Error(
    [
      'DATABASE_URL_TEST is not set. The e2e tests serve the app against the',
      'test database: copy .env.example to .env, or export DATABASE_URL_TEST.',
    ].join('\n'),
  )
}

const port = 3100
const baseURL = `http://localhost:${port}`

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  // Chromium only: voice and WebMCP exist only in Chrome.
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Migrates and empties the test database. Playwright starts the web server
  // before the global setup, which is safe because the app opens its Prisma
  // connection on the first query, not at startup.
  globalSetup: './tests/e2e/global-setup.ts',
  webServer: {
    // Vite is started with node rather than pnpm exec: pnpm runs it in a
    // separate process group, which Playwright's shutdown does not reach, so
    // the server outlived the run and Playwright waited minutes for it.
    command: `pnpm build && node node_modules/vite/bin/vite.js preview --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // The app reads DATABASE_URL, so pointing it at the test database keeps
    // e2e runs away from the app data. vite.config.ts validates every variable
    // on serve, so DATABASE_URL_TEST is passed as well.
    env: {
      DATABASE_URL: testDatabaseUrl,
      DATABASE_URL_TEST: testDatabaseUrl,
    },
  },
})
