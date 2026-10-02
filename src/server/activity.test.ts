// @vitest-environment node
// Server code runs without `window`. Under jsdom, t3-env treats the module as
// client code and blocks every server variable.
import { beforeEach, describe, expect, it } from 'vitest'

import { listTaskActivity } from '#/server/activity'
import { db } from '#/server/db'
import { NotFoundError } from '#/server/errors'
import { createProject } from '#/server/projects'
import {
  completeTask,
  createTask,
  deleteTask,
  moveTask,
  updateTask,
} from '#/server/tasks'
import { resetDatabase } from '#/test/db'

beforeEach(() => resetDatabase(db))

describe('listTaskActivity', () => {
  it('throws NotFoundError for an unknown task', async () => {
    await expect(listTaskActivity('no-such-id')).rejects.toBeInstanceOf(
      NotFoundError,
    )
  })

  it("returns the task's rows oldest first", async () => {
    const project = await createProject({ name: 'Website', key: 'WEB' })
    const [backlog, todo] = project.statuses
    const task = await createTask(project.id, {
      title: 'Write copy',
      statusId: backlog.id,
    })
    await updateTask(task.id, {
      title: 'Write the copy',
      dueDate: '2026-10-01',
    })
    await moveTask(task.id, { statusId: todo.id })
    await completeTask(task.id)

    const rows = await listTaskActivity(task.id)

    expect(rows.map(({ type, payload }) => ({ type, payload }))).toEqual([
      { type: 'task.created', payload: { number: 1, title: 'Write copy' } },
      {
        type: 'task.updated',
        payload: { number: 1, fields: ['title', 'dueDate'] },
      },
      {
        type: 'task.moved',
        payload: { number: 1, from: backlog.name, to: todo.name },
      },
      { type: 'task.completed', payload: { number: 1 } },
    ])
    for (const row of rows) {
      expect(typeof row.id).toBe('string')
      expect(row.createdAt).toBeInstanceOf(Date)
    }
  })

  it('orders by time, not by insertion', async () => {
    const project = await createProject({ name: 'Website', key: 'WEB' })
    const task = await createTask(project.id, { title: 'Write copy' })
    // A row written later but dated earlier comes first.
    await db.activity.create({
      data: {
        projectId: project.id,
        taskId: task.id,
        type: 'comment.added',
        payload: { body: 'Early' },
        createdAt: new Date('2000-01-01T00:00:00.000Z'),
      },
    })

    const rows = await listTaskActivity(task.id)

    expect(rows.map((row) => row.type)).toEqual([
      'comment.added',
      'task.created',
    ])
  })

  it("leaves out other tasks' rows and a deleted task's rows", async () => {
    const project = await createProject({ name: 'Website', key: 'WEB' })
    const kept = await createTask(project.id, { title: 'Keep me' })
    const gone = await createTask(project.id, { title: 'Delete me' })
    await deleteTask(gone.id)

    const rows = await listTaskActivity(kept.id)

    expect(rows.map((row) => row.payload)).toEqual([
      { number: 1, title: 'Keep me' },
    ])
    // The deleted task's rows are still in the project history.
    const orphaned = await db.activity.findMany({
      where: {
        projectId: project.id,
        taskId: null,
        type: { startsWith: 'task.' },
      },
      orderBy: { createdAt: 'asc' },
    })
    expect(orphaned.map((row) => row.type)).toEqual([
      'task.created',
      'task.deleted',
    ])
    await expect(listTaskActivity(gone.id)).rejects.toBeInstanceOf(
      NotFoundError,
    )
  })
})
