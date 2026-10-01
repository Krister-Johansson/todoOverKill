// @vitest-environment node
// Server code runs without `window`. Under jsdom, t3-env treats the module as
// client code and blocks every server variable.
import { afterAll, describe, expect, it } from 'vitest'

import { db } from '#/server/db'

describe('db', () => {
  afterAll(async () => {
    await db.$disconnect()
  })

  it('connects to the migrated database, which has no projects', async () => {
    await expect(db.project.count()).resolves.toBe(0)
  })

  it('uses the test database under NODE_ENV=test', async () => {
    const rows = await db.$queryRaw<
      Array<{ name: string }>
    >`SELECT current_database() AS name`

    expect(rows).toEqual([{ name: 'todo_over_kill_test' }])
  })
})
