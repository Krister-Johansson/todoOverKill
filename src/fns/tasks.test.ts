// @vitest-environment node
// Server code runs without `window`. Under jsdom, t3-env treats the module as
// client code and blocks every server variable.
import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  taskActivityQueryOptions,
  taskQueryOptions,
  toCreateTaskResult,
} from '#/fns/tasks'
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

describe('taskActivityQueryOptions', () => {
  it("sits under the task's key, so invalidating the task refreshes it", () => {
    const taskKey = taskQueryOptions('t1').queryKey
    const activityKey = taskActivityQueryOptions('t1').queryKey

    expect(activityKey.slice(0, taskKey.length)).toEqual([...taskKey])
    expect(activityKey).toEqual(['tasks', 't1', 'activity'])
  })

  it("is invalidated with the task, as the Move menu's onSettled does it", async () => {
    const queryClient = new QueryClient()
    const activityKey = taskActivityQueryOptions('t1').queryKey
    queryClient.setQueryData(activityKey, [])

    await queryClient.invalidateQueries({
      queryKey: taskQueryOptions('t1').queryKey,
    })

    expect(queryClient.getQueryState(activityKey)?.isInvalidated).toBe(true)
  })
})
