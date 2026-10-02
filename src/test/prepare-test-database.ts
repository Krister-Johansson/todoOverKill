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
 * PostgreSQL major version as the dev database.
 */
export function composePostgresImage(compose: string) {
  const image = /^\s+image:\s*['"]?(postgres:\d+[^\s'"]*)/m.exec(compose)?.[1]
  if (!image) {
    throw new Error(
      [
        'docker-compose.yml has no `image: postgres:<version>` line. The test',
        'database container uses the same image as the dev database.',
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

  let container
  try {
    container = await new PostgreSqlContainer(image)
      .withDatabase(database)
      .withUsername('todo')
      .withPassword('todo')
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
    await stop()
    throw error
  }

  return { url, stop }
}
