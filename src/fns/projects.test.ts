// @vitest-environment node
// Server code runs without `window`. Under jsdom, t3-env treats the module as
// client code and blocks every server variable.
import { beforeEach, describe, expect, it } from 'vitest'

import { toCreateResult } from '#/fns/projects'
import { db } from '#/server/db'
import { createProject } from '#/server/projects'
import { resetDatabase } from '#/test/db'

beforeEach(() => resetDatabase(db))

describe('toCreateResult', () => {
  it('returns the created project', async () => {
    const result = await toCreateResult(() =>
      createProject({ name: 'Website', key: 'web' }),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.project).toMatchObject({ name: 'Website', key: 'WEB' })
  })

  it('returns a taken key as a conflict result', async () => {
    await createProject({ name: 'Website', key: 'WEB' })

    const result = await toCreateResult(() =>
      createProject({ name: 'Webshop', key: 'WEB' }),
    )

    expect(result).toEqual({
      ok: false,
      code: 'conflict',
      message: 'Another project already uses the key WEB.',
    })
  })

  it('rethrows any other error', async () => {
    await expect(
      toCreateResult(() => createProject({ name: '', key: 'WEB' })),
    ).rejects.toThrow()
  })
})
