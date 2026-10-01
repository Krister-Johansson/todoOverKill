import { describe, expect, it } from 'vitest'

import { env } from '#/env'
import { db } from '#/server/db'
import { resetDatabase } from '#/test/db'

function databaseName(url: string) {
  return decodeURIComponent(new URL(url).pathname.slice(1))
}

describe('db', () => {
  it('connects to the migrated database, which has no projects', async () => {
    await expect(db.project.count()).resolves.toBe(0)
  })

  it('uses the test database under NODE_ENV=test', async () => {
    const rows = await db.$queryRaw<
      Array<{ name: string }>
    >`SELECT current_database() AS name`

    // The test database name comes from DATABASE_URL_TEST, so a worktree can
    // point at its own copy. It must never be the app database.
    const testName = databaseName(env.DATABASE_URL_TEST)
    expect(testName).not.toBe(databaseName(env.DATABASE_URL))
    expect(rows).toEqual([{ name: testName }])
  })
})

describe('resetDatabase', () => {
  it('empties the tables and keeps the migration history', async () => {
    const project = await db.project.create({
      data: { name: 'Reset', key: 'RST' },
    })
    await db.status.create({
      data: {
        projectId: project.id,
        name: 'Todo',
        order: 1,
        category: 'todo',
      },
    })

    await resetDatabase(db)

    await expect(db.project.count()).resolves.toBe(0)
    await expect(db.status.count()).resolves.toBe(0)
    const migrations = await db.$queryRaw<
      Array<{ count: bigint }>
    >`SELECT count(*) AS count FROM _prisma_migrations`
    expect(migrations[0].count).toBeGreaterThan(0n)

    // The same unique key can be used again.
    await expect(
      db.project.create({ data: { name: 'Again', key: 'RST' } }),
    ).resolves.toMatchObject({ key: 'RST' })
    await resetDatabase(db)
  })
})
