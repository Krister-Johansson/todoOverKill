import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { defineConfig, devices } from '@playwright/test'

// tests/e2e/serve.ts writes the URL of this run's database container here, and
// the global setup reads it. The main process sets the path once; the workers
// load this config again but inherit the variable, so all agree on it.
process.env.E2E_DATABASE_URL_FILE ??= join(
  tmpdir(),
  `todo-over-kill-e2e-${process.pid}.url`,
)

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
  // Passes the container URL to the specs. Playwright runs it after the web
  // server is up.
  globalSetup: './tests/e2e/global-setup.ts',
  webServer: {
    // Starts a PostgreSQL container for this run, builds the app, and serves
    // it against the container. See tests/e2e/serve.ts.
    command: `node tests/e2e/serve.ts ${port}`,
    url: baseURL,
    // Never reuse a running server: it would not point at this run's
    // container, and the specs would read a different database than it.
    reuseExistingServer: false,
    // Pulling the PostgreSQL image on a first run adds to the build time.
    timeout: 300_000,
    // SIGTERM lets serve.ts stop the container. Without it Playwright kills
    // the process group at once and Ryuk removes the container later.
    gracefulShutdown: { signal: 'SIGTERM', timeout: 30_000 },
  },
})
