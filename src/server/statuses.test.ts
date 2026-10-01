// @vitest-environment node
// Server code runs without `window`. Under jsdom, t3-env treats the module as
// client code and blocks every server variable.
import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '#/server/db'
import { ConflictError, NotFoundError } from '#/server/errors'
import { archiveProject, createProject } from '#/server/projects'
import {
  addStatus,
  deleteStatus,
  listStatuses,
  renameStatus,
  reorderStatuses,
} from '#/server/statuses'
import { createTask } from '#/server/tasks'
import { resetDatabase } from '#/test/db'

const UNKNOWN_ID = 'no-such-id'

beforeEach(() => resetDatabase(db))

function createWebsite() {
  return createProject({ name: 'Website', key: 'WEB' })
}

/** Name and order of every status of the project, in board order. */
async function boardOf(projectId: string) {
  const statuses = await db.status.findMany({
    where: { projectId },
    orderBy: { order: 'asc' },
    select: { name: true, order: true },
  })
  return statuses
}

describe('listStatuses', () => {
  it('returns the default statuses in board order', async () => {
    const project = await createWebsite()

    const statuses = await listStatuses(project.id)

    expect(
      statuses.map(({ name, order, category }) => ({ name, order, category })),
    ).toEqual([
      { name: 'Backlog', order: 1, category: 'todo' },
      { name: 'Todo', order: 2, category: 'todo' },
      { name: 'In progress', order: 3, category: 'in_progress' },
      { name: 'Done', order: 4, category: 'done' },
    ])
  })

  it('returns only the statuses of the given project', async () => {
    const project = await createWebsite()
    await createProject({ name: 'Other', key: 'OTH' })

    const statuses = await listStatuses(project.id)

    expect(statuses).toHaveLength(4)
    expect(statuses.every((s) => s.projectId === project.id)).toBe(true)
  })

  it('throws NotFoundError for an unknown project', async () => {
    const attempt = listStatuses(UNKNOWN_ID)

    await expect(attempt).rejects.toBeInstanceOf(NotFoundError)
    await expect(attempt).rejects.toMatchObject({ code: 'not_found' })
  })
})

describe('addStatus', () => {
  it('appends the status after the existing ones with a trimmed name', async () => {
    const project = await createWebsite()

    const status = await addStatus(project.id, {
      name: '  Review ',
      category: 'in_progress',
    })

    expect(status).toMatchObject({
      projectId: project.id,
      name: 'Review',
      category: 'in_progress',
      order: 5,
    })
    expect((await boardOf(project.id)).map((s) => s.name)).toEqual([
      'Backlog',
      'Todo',
      'In progress',
      'Done',
      'Review',
    ])
  })

  it('starts at order 1 when the project has no statuses', async () => {
    const project = await createWebsite()
    await db.status.deleteMany({ where: { projectId: project.id } })

    const status = await addStatus(project.id, {
      name: 'Todo',
      category: 'todo',
    })

    expect(status.order).toBe(1)
  })

  it('adds to an archived project', async () => {
    const project = await createWebsite()
    await archiveProject(project.id)

    const status = await addStatus(project.id, {
      name: 'Later',
      category: 'todo',
    })

    expect(status.order).toBe(5)
  })

  it('rejects an invalid category or name without writing anything', async () => {
    const project = await createWebsite()

    await expect(
      // @ts-expect-error the category is not one of the enum values
      addStatus(project.id, { name: 'Review', category: 'blocked' }),
    ).rejects.toThrow()
    await expect(
      addStatus(project.id, { name: ' ', category: 'todo' }),
    ).rejects.toThrow()

    await expect(db.status.count()).resolves.toBe(4)
  })

  it('throws NotFoundError for an unknown project', async () => {
    const attempt = addStatus(UNKNOWN_ID, { name: 'Review', category: 'todo' })

    await expect(attempt).rejects.toBeInstanceOf(NotFoundError)
    await expect(db.status.count()).resolves.toBe(0)
  })
})

describe('renameStatus', () => {
  it('changes the name and nothing else', async () => {
    const project = await createWebsite()
    const todo = project.statuses[1]

    const renamed = await renameStatus(todo.id, { name: ' Ready ' })

    expect(renamed).toEqual({ ...todo, name: 'Ready' })
  })

  it('throws NotFoundError for an unknown id', async () => {
    const attempt = renameStatus(UNKNOWN_ID, { name: 'Ready' })

    await expect(attempt).rejects.toBeInstanceOf(NotFoundError)
    await expect(attempt).rejects.toMatchObject({ code: 'not_found' })
  })
})

describe('reorderStatuses', () => {
  it('rewrites the orders 1..n in the given sequence', async () => {
    const project = await createWebsite()
    const [backlog, todo, inProgress, done] = project.statuses

    const statuses = await reorderStatuses(project.id, {
      statusIds: [done.id, backlog.id, inProgress.id, todo.id],
    })

    const expected = [
      { name: 'Done', order: 1 },
      { name: 'Backlog', order: 2 },
      { name: 'In progress', order: 3 },
      { name: 'Todo', order: 4 },
    ]
    expect(statuses.map(({ name, order }) => ({ name, order }))).toEqual(
      expected,
    )
    await expect(boardOf(project.id)).resolves.toEqual(expected)
  })

  it('throws ConflictError for a list with a missing id', async () => {
    const project = await createWebsite()
    const ids = project.statuses.map((s) => s.id)

    const attempt = reorderStatuses(project.id, {
      statusIds: ids.slice(1).reverse(),
    })

    await expect(attempt).rejects.toBeInstanceOf(ConflictError)
    await expect(attempt).rejects.toMatchObject({ code: 'conflict' })
    await expect(boardOf(project.id)).resolves.toEqual([
      { name: 'Backlog', order: 1 },
      { name: 'Todo', order: 2 },
      { name: 'In progress', order: 3 },
      { name: 'Done', order: 4 },
    ])
  })

  it("throws ConflictError for a list with another project's status", async () => {
    const project = await createWebsite()
    const other = await createProject({ name: 'Other', key: 'OTH' })
    const ids = project.statuses.map((s) => s.id)

    const attempt = reorderStatuses(project.id, {
      statusIds: [...ids.slice(1), other.statuses[0].id],
    })

    await expect(attempt).rejects.toBeInstanceOf(ConflictError)
    await expect(boardOf(other.id)).resolves.toEqual([
      { name: 'Backlog', order: 1 },
      { name: 'Todo', order: 2 },
      { name: 'In progress', order: 3 },
      { name: 'Done', order: 4 },
    ])
  })

  it('throws NotFoundError for an unknown project', async () => {
    const attempt = reorderStatuses(UNKNOWN_ID, { statusIds: ['a'] })

    await expect(attempt).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe('deleteStatus', () => {
  it('removes a status that no task uses and leaves the others in order', async () => {
    const project = await createWebsite()
    const todo = project.statuses[1]

    const deleted = await deleteStatus(todo.id)

    expect(deleted).toEqual(todo)
    await expect(boardOf(project.id)).resolves.toEqual([
      { name: 'Backlog', order: 1 },
      { name: 'In progress', order: 3 },
      { name: 'Done', order: 4 },
    ])
  })

  it('may delete the last status of a project', async () => {
    const project = await createWebsite()

    for (const status of project.statuses) await deleteStatus(status.id)

    await expect(listStatuses(project.id)).resolves.toEqual([])
  })

  it('throws ConflictError while a task uses the status and keeps both', async () => {
    const project = await createWebsite()
    const todo = project.statuses[1]
    const task = await createTask(project.id, {
      title: 'Write copy',
      statusId: todo.id,
    })

    const attempt = deleteStatus(todo.id)

    await expect(attempt).rejects.toBeInstanceOf(ConflictError)
    await expect(attempt).rejects.toMatchObject({
      code: 'conflict',
      message:
        '1 task still uses the status Todo. Move its tasks to another status first.',
    })
    await expect(
      db.status.findUnique({ where: { id: todo.id } }),
    ).resolves.toEqual(todo)
    await expect(
      db.task.findUnique({ where: { id: task.id } }),
    ).resolves.toMatchObject({ statusId: todo.id })
  })

  it('deletes the status once its tasks have moved', async () => {
    const project = await createWebsite()
    const [backlog, todo] = project.statuses
    const task = await createTask(project.id, {
      title: 'Write copy',
      statusId: todo.id,
    })
    await expect(deleteStatus(todo.id)).rejects.toBeInstanceOf(ConflictError)

    await db.task.update({
      where: { id: task.id },
      data: { statusId: backlog.id },
    })
    await deleteStatus(todo.id)

    await expect(
      db.status.findUnique({ where: { id: todo.id } }),
    ).resolves.toBeNull()
  })

  it('throws NotFoundError for an unknown id', async () => {
    const attempt = deleteStatus(UNKNOWN_ID)

    await expect(attempt).rejects.toBeInstanceOf(NotFoundError)
    await expect(attempt).rejects.toMatchObject({ code: 'not_found' })
  })
})
