import { execFileSync } from 'node:child_process'
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

// A free port per run, so e2e runs in several worktrees do not clash. The
// main process asks the OS for one; the workers inherit the variable, as above.
// Export E2E_PORT to choose it yourself.
process.env.E2E_PORT ??= execFileSync(
  process.execPath,
  [
    '-e',
    "const s = require('node:net').createServer().listen(0, '127.0.0.1', () => { process.stdout.write(String(s.address().port)); s.close() })",
  ],
  { encoding: 'utf8' },
)

const port = Number(process.env.E2E_PORT)
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
