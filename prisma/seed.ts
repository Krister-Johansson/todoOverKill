// Entry point for `pnpm db:seed`, run by Prisma through tsx (see
// prisma.config.ts). The demo data lives in src/server/seed.ts.
import { loadDotEnv } from '#/lib/load-dot-env'

// Before the imports below: src/env.ts validates when it loads.
loadDotEnv('development', process.cwd())

const { seed } = await import('#/server/seed')
const { db } = await import('#/server/db')

try {
  const result = await seed(db)
  const summary = Object.entries(result)
    .map(([key, { tasks }]) => `${key} (${tasks} tasks)`)
    .join(', ')
  console.log(`Seeded ${summary}.`)
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await db.$disconnect()
}
