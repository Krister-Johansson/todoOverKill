// @vitest-environment node
// Server code runs without `window`. Under jsdom, t3-env treats the module as
// client code and blocks every server variable.
import { beforeEach, describe, expect, it } from 'vitest'

import { toCreateTaskResult } from '#/fns/tasks'
import { db } from '#/server/db'
import { createProject } from '#/server/projects'
import { createTask } from '#/server/tasks'
import { resetDatabase } from '#/test/db'

beforeEach(() => resetDatabase(db))

describe('toCreateTaskResult', () => {
  it('returns the created task', async () => {
    const project = await createProject({ name: 'Website', key: 'WEB' })

    const result = await toCreateTaskResult(() =>
      createTask(project.id, { title: 'Write copy', priority: 'high' }),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.task).toMatchObject({
      title: 'Write copy',
      number: 1,
      priority: 'high',
      statusId: project.statuses[0].id,
    })
  })

  it('returns a project without statuses as a conflict result', async () => {
    const project = await db.project.create({
      data: { name: 'Empty', key: 'EMP', color: '#2563eb' },
    })

    const result = await toCreateTaskResult(() =>
      createTask(project.id, { title: 'Write copy' }),
    )

    expect(result).toEqual({
      ok: false,
      code: 'conflict',
      message: 'The project has no statuses. Add a status first.',
    })
  })

  it('rethrows a missing project', async () => {
    await expect(
      toCreateTaskResult(() => createTask('missing', { title: 'Write copy' })),
    ).rejects.toMatchObject({ code: 'not_found' })
  })
})
