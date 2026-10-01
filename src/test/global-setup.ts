import { execFileSync } from 'node:child_process'

/**
 * Brings the test database up to date before any test file runs.
 * vitest.config.ts has already loaded .env into process.env. The URL is
 * passed to Prisma as DATABASE_URL, and prisma.config.ts lets a variable set
 * in the environment win over .env, so migrations never reach the app
 * database.
 */
export default function setup() {
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

  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  })
}
