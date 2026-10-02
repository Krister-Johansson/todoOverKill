// @vitest-environment node
// Server code runs without `window`. Under jsdom, t3-env treats the module as
// client code and blocks every server variable.
import { beforeEach, describe, expect, it } from 'vitest'
import { ZodError } from 'zod'

import { listTaskActivity } from '#/server/activity'
import { db } from '#/server/db'
import { NotFoundError } from '#/server/errors'
import { createProject } from '#/server/projects'
import {
  addSubtask,
  deleteSubtask,
  listSubtasks,
  moveSubtask,
  updateSubtask,
} from '#/server/subtasks'
import { createTask, deleteTask, getTask, listTasks } from '#/server/tasks'
import { resetDatabase } from '#/test/db'

const UNKNOWN_ID = 'no-such-id'

beforeEach(() => resetDatabase(db))

/** A task, WEB-1, in a new project. */
async function createWebsiteTask() {
  const project = await createProject({ name: 'Website', key: 'WEB' })
  const task = await createTask(project.id, { title: 'Write copy' })
  return { project, task }
}

/** A task with the subtasks A, B, C, D in that order. */
async function createTaskWithSubtasks() {
  const { project, task } = await createWebsiteTask()
  const subtasks = []
  for (const title of ['A', 'B', 'C', 'D']) {
    subtasks.push(await addSubtask(task.id, { title }))
  }
  return { project, task, subtasks }
}

/** Runs `action` and returns the activity rows it added to the project. */
async function newActivity(projectId: string, action: () => Promise<unknown>) {
  const before = await db.activity.findMany({
    where: { projectId },
    select: { id: true },
  })
  const seen = new Set(before.map((row) => row.id))
  await action()
  const after = await db.activity.findMany({
    where: { projectId },
    select: { id: true, type: true, payload: true, taskId: true },
  })
  return after.filter((row) => !seen.has(row.id)).map(({ id, ...row }) => row)
}

async function titlesOf(taskId: string) {
  return (await listSubtasks(taskId)).map((subtask) => subtask.title)
}

describe('listSubtasks', () => {
  it('returns an empty list for a task without subtasks', async () => {
    const { task } = await createWebsiteTask()
    expect(await listSubtasks(task.id)).toEqual([])
  })

  it('throws NotFoundError for an unknown task', async () => {
    const error = await listSubtasks(UNKNOWN_ID).catch((caught) => caught)
    expect(error).toBeInstanceOf(NotFoundError)
    expect(error).toMatchObject({ code: 'not_found' })
  })
})

describe('addSubtask', () => {
  it('appends in order, not done, with a trimmed title', async () => {
    const { task } = await createWebsiteTask()
    const first = await addSubtask(task.id, { title: '  Draft the intro ' })
    await addSubtask(task.id, { title: 'Edit' })
    await addSubtask(task.id, { title: 'Publish' })

    expect(first).toMatchObject({
      taskId: task.id,
      title: 'Draft the intro',
      done: false,
      order: 1,
    })
    const subtasks = await listSubtasks(task.id)
    expect(subtasks.map((subtask) => subtask.title)).toEqual([
      'Draft the intro',
      'Edit',
      'Publish',
    ])
    expect(subtasks.map((subtask) => subtask.order)).toEqual([1, 2, 3])
  })

  it('writes one subtask.added row on the task', async () => {
    const { project, task } = await createWebsiteTask()
    const rows = await newActivity(project.id, () =>
      addSubtask(task.id, { title: 'Draft' }),
    )
    expect(rows).toEqual([
      {
        type: 'subtask.added',
        taskId: task.id,
        payload: { number: 1, title: 'Draft' },
      },
    ])
    expect((await listTaskActivity(task.id)).map((row) => row.type)).toEqual([
      'task.created',
      'subtask.added',
    ])
  })

  it('throws NotFoundError for an unknown task', async () => {
    await expect(addSubtask(UNKNOWN_ID, { title: 'Draft' })).rejects.toThrow(
      NotFoundError,
    )
  })

  it('rejects invalid input and writes nothing', async () => {
    const { project, task } = await createWebsiteTask()
    const rows = await newActivity(project.id, async () => {
      await expect(addSubtask(task.id, { title: '  ' })).rejects.toThrow(
        ZodError,
      )
      await expect(
        addSubtask(task.id, { title: 'Draft', done: true } as never),
      ).rejects.toThrow(ZodError)
    })
    expect(rows).toEqual([])
    expect(await listSubtasks(task.id)).toEqual([])
  })
})

describe('updateSubtask', () => {
  it('completes and reopens with one row each', async () => {
    const { project, task, subtasks } = await createTaskWithSubtasks()
    const [first] = subtasks

    const completed = await newActivity(project.id, async () => {
      expect(await updateSubtask(first.id, { done: true })).toMatchObject({
        done: true,
      })
    })
    const reopened = await newActivity(project.id, async () => {
      expect(await updateSubtask(first.id, { done: false })).toMatchObject({
        done: false,
      })
    })

    expect(completed).toEqual([
      {
        type: 'subtask.completed',
        taskId: task.id,
        payload: { number: 1, title: 'A' },
      },
    ])
    expect(reopened).toEqual([
      {
        type: 'subtask.reopened',
        taskId: task.id,
        payload: { number: 1, title: 'A' },
      },
    ])
  })

  it('renames with a trimmed title and a subtask.updated row', async () => {
    const { project, task, subtasks } = await createTaskWithSubtasks()
    const rows = await newActivity(project.id, async () => {
      expect(
        await updateSubtask(subtasks[1].id, { title: '  Beta ' }),
      ).toMatchObject({ title: 'Beta', done: false, order: 2 })
    })
    expect(rows).toEqual([
      {
        type: 'subtask.updated',
        taskId: task.id,
        payload: { number: 1, title: 'Beta', fields: ['title'] },
      },
    ])
    expect(await titlesOf(task.id)).toEqual(['A', 'Beta', 'C', 'D'])
  })

  it('writes one subtask.updated row for a rename and a toggle together', async () => {
    const { project, subtasks } = await createTaskWithSubtasks()
    const rows = await newActivity(project.id, () =>
      updateSubtask(subtasks[0].id, { title: 'Alpha', done: true }),
    )
    expect(rows).toEqual([
      expect.objectContaining({
        type: 'subtask.updated',
        payload: { number: 1, title: 'Alpha', fields: ['title', 'done'] },
      }),
    ])
  })

  it('writes nothing when nothing changes', async () => {
    const { project, subtasks } = await createTaskWithSubtasks()
    const [first] = subtasks
    const rows = await newActivity(project.id, async () => {
      expect(await updateSubtask(first.id, {})).toEqual(first)
      expect(await updateSubtask(first.id, { title: ' A ' })).toEqual(first)
      expect(
        await updateSubtask(first.id, { title: 'A', done: false }),
      ).toEqual(first)
    })
    expect(rows).toEqual([])
  })

  it('throws NotFoundError for an unknown subtask', async () => {
    const error = await updateSubtask(UNKNOWN_ID, { done: true }).catch(
      (caught) => caught,
    )
    expect(error).toBeInstanceOf(NotFoundError)
    expect(error.message).toBe(`No subtask with id ${UNKNOWN_ID}.`)
  })

  it('rejects invalid input and writes nothing', async () => {
    const { project, subtasks } = await createTaskWithSubtasks()
    const rows = await newActivity(project.id, async () => {
      await expect(
        updateSubtask(subtasks[0].id, { title: '' }),
      ).rejects.toThrow(ZodError)
      await expect(
        updateSubtask(subtasks[0].id, { order: 9 } as never),
      ).rejects.toThrow(ZodError)
    })
    expect(rows).toEqual([])
  })
})

describe('moveSubtask', () => {
  it('moves to the top, the middle, and past the end', async () => {
    const { task, subtasks } = await createTaskWithSubtasks()
    const [a, b, c, d] = subtasks

    await moveSubtask(c.id, { index: 0 })
    expect(await titlesOf(task.id)).toEqual(['C', 'A', 'B', 'D'])

    await moveSubtask(d.id, { index: 1 })
    expect(await titlesOf(task.id)).toEqual(['C', 'D', 'A', 'B'])

    await moveSubtask(c.id, { index: 99 })
    expect(await titlesOf(task.id)).toEqual(['D', 'A', 'B', 'C'])

    await moveSubtask(b.id, { index: 1 })
    expect(await titlesOf(task.id)).toEqual(['D', 'B', 'A', 'C'])

    expect(
      (await listSubtasks(task.id)).map((subtask) => subtask.order),
    ).toEqual([1, 2, 3, 4])
    expect(await moveSubtask(a.id, { index: 3 })).toMatchObject({
      id: a.id,
      order: 4,
    })
  })

  it('writes one subtask.moved row with the old and new index', async () => {
    const { project, task, subtasks } = await createTaskWithSubtasks()
    const rows = await newActivity(project.id, () =>
      moveSubtask(subtasks[3].id, { index: 1 }),
    )
    expect(rows).toEqual([
      {
        type: 'subtask.moved',
        taskId: task.id,
        payload: { number: 1, title: 'D', from: 3, to: 1 },
      },
    ])
  })

  it('writes nothing for a move to its own place', async () => {
    const { project, task, subtasks } = await createTaskWithSubtasks()
    const rows = await newActivity(project.id, async () => {
      expect(await moveSubtask(subtasks[1].id, { index: 1 })).toEqual(
        subtasks[1],
      )
      expect(await moveSubtask(subtasks[3].id, { index: 10 })).toEqual(
        subtasks[3],
      )
    })
    expect(rows).toEqual([])
    expect(await titlesOf(task.id)).toEqual(['A', 'B', 'C', 'D'])
  })

  it('throws NotFoundError for an unknown subtask', async () => {
    await expect(moveSubtask(UNKNOWN_ID, { index: 0 })).rejects.toThrow(
      NotFoundError,
    )
  })

  it('rejects a negative or fractional index and writes nothing', async () => {
    const { project, subtasks } = await createTaskWithSubtasks()
    const rows = await newActivity(project.id, async () => {
      await expect(moveSubtask(subtasks[0].id, { index: -1 })).rejects.toThrow(
        ZodError,
      )
      await expect(moveSubtask(subtasks[0].id, { index: 1.5 })).rejects.toThrow(
        ZodError,
      )
    })
    expect(rows).toEqual([])
  })
})

describe('deleteSubtask', () => {
  it('returns the subtask, removes it, and keeps the others in order', async () => {
    const { project, task, subtasks } = await createTaskWithSubtasks()
    let deleted: unknown
    const rows = await newActivity(project.id, async () => {
      deleted = await deleteSubtask(subtasks[1].id)
    })
    expect(deleted).toEqual(subtasks[1])
    expect(rows).toEqual([
      {
        type: 'subtask.deleted',
        taskId: task.id,
        payload: { number: 1, title: 'B' },
      },
    ])
    const left = await listSubtasks(task.id)
    expect(left.map((subtask) => subtask.title)).toEqual(['A', 'C', 'D'])
    expect(left.map((subtask) => subtask.order)).toEqual([1, 3, 4])
  })

  it('throws NotFoundError for an unknown or already deleted subtask', async () => {
    const { subtasks } = await createTaskWithSubtasks()
    await deleteSubtask(subtasks[0].id)
    await expect(deleteSubtask(subtasks[0].id)).rejects.toThrow(NotFoundError)
    await expect(deleteSubtask(UNKNOWN_ID)).rejects.toThrow(NotFoundError)
  })
})

describe('with the tasks service', () => {
  it('leaves getTask and listTasks as they were', async () => {
    const { project, task } = await createWebsiteTask()
    const before = {
      one: await getTask(task.id),
      all: await listTasks(project.id),
    }
    await addSubtask(task.id, { title: 'Draft' })
    expect(await getTask(task.id)).toEqual(before.one)
    expect(await listTasks(project.id)).toEqual(before.all)
  })

  it('deletes the subtasks with their task', async () => {
    const { subtasks, task } = await createTaskWithSubtasks()
    await deleteTask(task.id)
    expect(await db.subtask.count()).toBe(0)
    await expect(updateSubtask(subtasks[0].id, { done: true })).rejects.toThrow(
      NotFoundError,
    )
  })
})
