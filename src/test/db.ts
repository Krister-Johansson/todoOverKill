// Relative imports, and nothing from #/server/db or #/env: the Playwright
// specs load this file too, outside Vite and without NODE_ENV=test.
import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '../generated/prisma/client.ts'

/**
 * A Prisma client for the test database, for code that cannot use the db
 * singleton because NODE_ENV is not test, such as the Playwright specs, whose
 * global setup sets DATABASE_URL_TEST. Throws when it is unset.
 */
export function createTestPrismaClient() {
  const connectionString = process.env.DATABASE_URL_TEST
  if (!connectionString) throw new Error('DATABASE_URL_TEST is not set.')
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
}

/**
 * Empties every table in the public schema except Prisma's migration history,
 * and restarts their sequences. Takes the client as an argument so the caller
 * decides which database it points at.
 */
export async function resetDatabase(client: PrismaClient) {
  const tables = await client.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `
  if (tables.length === 0) return

  const list = tables
    .map(({ tablename }) => `"${tablename.replaceAll('"', '""')}"`)
    .join(', ')
  await client.$executeRawUnsafe(
    `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`,
  )
}
