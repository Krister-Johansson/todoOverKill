// The Playwright web server: `node tests/e2e/serve.ts <port>`. Starts this
// run's PostgreSQL container, builds the app, and serves it with vite preview
// against the container. Playwright starts the web server before its global
// setup, so the container has to come up here.
//
// Plain Node runs this file, so it imports nothing from the app.
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'

import { prepareTestDatabase } from '../../src/test/prepare-test-database.ts'
import type { TestDatabase } from '../../src/test/prepare-test-database.ts'

const port = process.argv[2]
// Set by playwright.config.ts. The global setup reads the URL from it and
// hands it to the specs, which open their own Prisma client.
const urlFile = process.env.E2E_DATABASE_URL_FILE

let database: TestDatabase | undefined
let child: ChildProcess | undefined
let exiting = false
// A function, so TypeScript does not narrow the flag across awaits, during
// which a signal handler may set it.
const isExiting = () => exiting

/** Stops the server and the container, once, then exits with `code`. */
async function shutdown(code: number) {
  if (exiting) return
  exiting = true
  if (child && child.exitCode === null) child.kill('SIGTERM')
  if (urlFile) rmSync(urlFile, { force: true })
  try {
    await database?.stop()
  } catch (error) {
    console.error('Could not stop the test database container:', error)
  }
  process.exit(code)
}

// Playwright's gracefulShutdown sends SIGTERM to the whole process group, so
// vite preview gets it too. A hard kill skips this handler; Testcontainers'
// Ryuk reaper then removes the container once this process is gone.
process.on('SIGTERM', () => void shutdown(0))
process.on('SIGINT', () => void shutdown(0))

/** Runs a command to completion and resolves with its exit code. */
function run(command: string, args: Array<string>, env: NodeJS.ProcessEnv) {
  return new Promise<number>((resolve) => {
    child = spawn(command, args, { env, stdio: 'inherit' })
    child.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)))
    child.once('error', (error) => {
      console.error(error)
      resolve(1)
    })
  })
}

async function main() {
  if (!port) throw new Error('Usage: node tests/e2e/serve.ts <port>')

  database = await prepareTestDatabase()
  if (urlFile) writeFileSync(urlFile, database.url)

  // A fresh worktree has no .env, so every variable the build and the server
  // need is passed here. vite.config.ts validates them on preview.
  const env = {
    ...process.env,
    DATABASE_URL: database.url,
    DATABASE_URL_TEST: database.url,
    // A placeholder, so the assistant panel is enabled. tests/e2e/
    // assistant.spec.ts mocks /api/chat in the browser, so the key is never
    // sent anywhere.
    OPENROUTER_API_KEY: 'e2e-placeholder',
  }

  const buildCode = await run('pnpm', ['build'], env)
  if (isExiting()) return
  if (buildCode !== 0) {
    console.error(`pnpm build failed with exit code ${buildCode}.`)
    return shutdown(buildCode)
  }

  // Vite is started with node rather than pnpm exec: pnpm runs it in a
  // separate process group, which Playwright's shutdown signal does not reach.
  const previewCode = await run(
    process.execPath,
    [
      'node_modules/vite/bin/vite.js',
      'preview',
      '--port',
      port,
      '--strictPort',
    ],
    env,
  )
  if (isExiting()) return
  console.error(`vite preview exited with code ${previewCode}.`)
  await shutdown(previewCode || 1)
}

main().catch(async (error: unknown) => {
  console.error(error)
  await shutdown(1)
})
