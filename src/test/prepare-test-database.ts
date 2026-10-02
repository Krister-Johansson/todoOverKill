import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'

import { PostgreSqlContainer } from '@testcontainers/postgresql'

export type TestDatabase = {
  /** Connection URL for the migrated database in the container. */
  url: string
  /** Stops and removes the container. */
  stop: () => Promise<void>
}

/**
 * The image of the compose `db` service, so the tests run on the same
 * PostgreSQL major version as the dev database. Only the `db:` block is read,
 * so another service in the file cannot change the version.
 */
export function composePostgresImage(compose: string) {
  // From the `db:` key up to the next key at the same indent or less.
  const service = /^( *)db:[^\S\n]*\n((?:\1 +.*\n|[^\S\n]*\n)*)/m.exec(
    compose.endsWith('\n') ? compose : `${compose}\n`,
  )?.[2]
  // postgres:17, docker.io/library/postgres:17-alpine, and so on.
  const image =
    service &&
    /^\s+image:\s*['"]?((?:[\w.-]+(?::\d+)?\/)*postgres:\d+[^\s'"]*)/m.exec(
      service,
    )?.[1]
  if (!image) {
    throw new Error(
      [
        'docker-compose.yml has no `image: postgres:<version>` line under the',
        '`db` service. The test database container uses the same image as the',
        'dev database.',
      ].join('\n'),
    )
  }
  return image
}

/**
 * Starts a PostgreSQL container for one test run and applies the migrations.
 * The Vitest global setup and tests/e2e/serve.ts both call it. It imports
 * nothing from the app, so plain Node can run it.
 *
 * Each call gets its own container, on a port Docker picks, so runs in other
 * worktrees never see this run's data. Testcontainers' Ryuk reaper removes the
 * container if the process dies before `stop` runs.
 *
 * The URL is passed to Prisma as DATABASE_URL, and prisma.config.ts lets a
 * variable set in the environment win over .env, so migrations never reach the
 * dev database.
 */
export async function prepareTestDatabase(): Promise<TestDatabase> {
  const image = composePostgresImage(
    readFileSync(new URL('../../docker-compose.yml', import.meta.url), 'utf8'),
  )
  // A name of its own per run, so a check of current_database() proves the
  // client reached this container rather than some other server.
  const database = `todo_over_kill_${randomBytes(4).toString('hex')}`
  // Docker publishes the port on every host interface, and Testcontainers
  // cannot limit it to loopback, so each run gets a password of its own.
  const password = randomBytes(16).toString('hex')

  let container
  try {
    container = await new PostgreSqlContainer(image)
      .withDatabase(database)
      .withUsername('todo')
      .withPassword(password)
      .start()
  } catch (error) {
    throw new Error(
      [
        `Could not start the ${image} test database container.`,
        'The tests need Docker: start Docker Desktop or the Docker daemon.',
        'Testcontainers finds it through DOCKER_HOST or the default socket.',
      ].join('\n'),
      { cause: error },
    )
  }

  const url = container.getConnectionUri()
  const stop = async () => {
    await container.stop()
  }

  try {
    execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'inherit',
    })
  } catch (error) {
    // Keep the migration error: a failed stop is logged, not rethrown.
    await stop().catch((stopError: unknown) => {
      console.error('Could not stop the test database container:', stopError)
    })
    throw error
  }

  return { url, stop }
}
