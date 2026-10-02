import { describe, expect, inject, it } from 'vitest'

import { db } from '#/server/db'
import { resetDatabase } from '#/test/db'

describe('db', () => {
  it('connects to the migrated database, which has no projects', async () => {
    await expect(db.project.count()).resolves.toBe(0)
  })

  it("uses this run's test container under NODE_ENV=test", async () => {
    const url = inject('testDatabaseUrl')
    const rows = await db.$queryRaw<
      Array<{ name: string }>
    >`SELECT current_database() AS name`

    // The setup file ran before src/env.ts loaded, so the db singleton,
    // created while setup-server.ts loaded, points at the container.
    expect(process.env.DATABASE_URL_TEST).toBe(url)
    expect(rows).toEqual([{ name: new URL(url).pathname.slice(1) }])
    expect(rows[0].name).toMatch(/^todo_over_kill_[0-9a-f]{8}$/)
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
