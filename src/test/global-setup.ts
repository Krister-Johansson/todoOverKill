import { execFileSync } from 'node:child_process'
import { connect } from 'node:net'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

/** Resolves true when something accepts a TCP connection on host:port. */
function isListening(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port, timeout: 1000 })
    const done = (result: boolean) => {
      socket.destroy()
      resolve(result)
    }
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
  })
}

/**
 * Brings the test database up to date before any test file runs.
 * vitest.config.ts has already loaded .env into process.env.
 *
 * If nothing answers on the DATABASE_URL_TEST host and it is local, the
 * compose database is started and stopped again after the run, so the tests
 * leave Docker as they found it.
 *
 * The URL is passed to Prisma as DATABASE_URL, and prisma.config.ts lets a
 * variable set in the environment win over .env, so migrations never reach the
 * app database.
 */
export default async function setup() {
  const url = process.env.DATABASE_URL_TEST
  if (!url) {
    throw new Error(
      [
        'DATABASE_URL_TEST is not set. The unit tests migrate and use the test',
        'database: copy .env.example to .env, or export DATABASE_URL_TEST, and',
        'start PostgreSQL with docker compose up -d.',
      ].join('\n'),
    )
  }

  const { hostname, port } = new URL(url)
  const dbPort = Number(port || 5432)
  let startedDb = false

  if (!(await isListening(hostname, dbPort))) {
    if (!LOCAL_HOSTS.has(hostname)) {
      throw new Error(
        `Nothing answers at ${hostname}:${dbPort}, the DATABASE_URL_TEST host.`,
      )
    }
    try {
      execFileSync('docker', ['compose', 'up', '--detach', '--wait', 'db'], {
        stdio: 'inherit',
      })
    } catch (error) {
      throw new Error(
        [
          `Nothing answers at ${hostname}:${dbPort} and docker compose up failed.`,
          'Start PostgreSQL with docker compose up -d, or point',
          'DATABASE_URL_TEST at a running server.',
        ].join('\n'),
        { cause: error },
      )
    }
    startedDb = true
  }

  const teardown = () => {
    if (startedDb) {
      execFileSync('docker', ['compose', 'stop', 'db'], { stdio: 'inherit' })
    }
  }

  try {
    execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'inherit',
    })
  } catch (error) {
    teardown()
    throw error
  }

  return teardown
}
