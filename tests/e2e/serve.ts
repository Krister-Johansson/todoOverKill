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

type Exit = { code: number; signal: NodeJS.Signals | null }

/** Runs a command to completion and resolves with how it ended. */
function run(command: string, args: Array<string>, env: NodeJS.ProcessEnv) {
  return new Promise<Exit>((resolve) => {
    child = spawn(command, args, { env, stdio: 'inherit' })
    child.once('exit', (code, signal) =>
      resolve({ code: code ?? (signal ? 1 : 0), signal }),
    )
    child.once('error', (error) => {
      console.error(error)
      resolve({ code: 1, signal: null })
    })
  })
}

/**
 * Runs Vite with node rather than through pnpm: pnpm runs it in a separate
 * process group, which Playwright's shutdown signal does not reach, so a build
 * cut off by the web server timeout would go on writing dist/.
 */
function vite(args: Array<string>, env: NodeJS.ProcessEnv) {
  return run(process.execPath, ['node_modules/vite/bin/vite.js', ...args], env)
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

  // `pnpm build` is `vite build`.
  const build = await vite(['build'], env)
  if (isExiting()) return
  if (build.code !== 0) {
    console.error(`vite build failed with exit code ${build.code}.`)
    return shutdown(build.code)
  }

  const preview = await vite(['preview', '--port', port, '--strictPort'], env)
  if (isExiting()) return
  // Playwright signals the whole process group, and the preview's exit can
  // arrive before this process handles its own SIGTERM. That is a shutdown,
  // not a crash.
  if (preview.signal === 'SIGTERM' || preview.signal === 'SIGINT') {
    return shutdown(0)
  }
  console.error(`vite preview exited with code ${preview.code}.`)
  await shutdown(preview.code || 1)
}

main().catch(async (error: unknown) => {
  console.error(error)
  await shutdown(1)
})
