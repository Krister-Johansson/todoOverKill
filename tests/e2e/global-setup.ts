import { readFileSync } from 'node:fs'

/**
 * Hands the URL of this run's database container to the specs, which open
 * their own Prisma client with createTestPrismaClient. Playwright runs this
 * after the web server is up, so tests/e2e/serve.ts has written the URL by
 * then, and the workers start later and inherit process.env.
 *
 * The container is new and empty for every run, so nothing is reset here.
 * Specs that write data clean up after themselves or use names no other spec
 * uses.
 */
export default function globalSetup() {
  const file = process.env.E2E_DATABASE_URL_FILE
  if (!file) throw new Error('E2E_DATABASE_URL_FILE is not set.')
  process.env.DATABASE_URL_TEST = readFileSync(file, 'utf8')
}
