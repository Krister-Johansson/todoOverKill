// @vitest-environment node
// Server code runs without `window`. Under jsdom, t3-env treats the module as
// client code and blocks every server variable.
import { beforeEach, describe, expect, it } from 'vitest'
import { ZodError } from 'zod'

import { describeActivity, fallbackSentence } from '#/lib/activity'
import { listTaskActivity } from '#/server/activity'
import {
  addComment,
  deleteComment,
  listComments,
  updateComment,
} from '#/server/comments'
import { db } from '#/server/db'
import { NotFoundError } from '#/server/errors'
import { createProject } from '#/server/projects'
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

/**
 * Waits past the current millisecond. Comments and activity rows sort by
 * createdAt and then by a random id, so two writes in one millisecond could
 * list in either order.
 */
function nextMillisecond() {
  return new Promise((resolve) => setTimeout(resolve, 5))
}

/** A task with the comments A, B, C, added in that order. */
async function createTaskWithComments() {
  const { project, task } = await createWebsiteTask()
  const comments = []
  for (const body of ['A', 'B', 'C']) {
    await nextMillisecond()
    comments.push(await addComment(task.id, { body }))
  }
  return { project, task, comments }
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

/**
 * Runs `action` while another transaction deletes the task. The action waits
 * on the task's row lock, and finds the task gone once the delete commits.
 */
async function deleteTaskDuring(
  taskId: string,
  action: () => Promise<unknown>,
) {
  let attempt: Promise<unknown> = Promise.resolve()
  let settled = false
  await db.$transaction(async (tx) => {
    await tx.task.delete({ where: { id: taskId } })
    attempt = action().finally(() => {
      settled = true
    })
    // Handled by the caller; this only stops an unhandled rejection meanwhile.
    attempt.catch(() => {})
    for (;;) {
      const [{ waiting }] = await db.$queryRaw<[{ waiting: bigint }]>`
        SELECT count(*) AS waiting FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'
      `
      if (waiting > 0 || settled) break
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
  })
  return attempt
}

async function bodiesOf(taskId: string) {
  return (await listComments(taskId)).map((comment) => comment.body)
}

describe('listComments', () => {
  it('returns an empty list for a task without comments', async () => {
    const { task } = await createWebsiteTask()
    expect(await listComments(task.id)).toEqual([])
  })

  it('lists the comments oldest first', async () => {
    const { task } = await createTaskWithComments()
    expect(await bodiesOf(task.id)).toEqual(['A', 'B', 'C'])
  })

  it('orders by createdAt, not by when the row was written, then by id', async () => {
    const { task } = await createWebsiteTask()
    const at = (minute: number) => new Date(Date.UTC(2026, 9, 1, 12, minute))
    for (const [body, minute] of [
      ['Late', 30],
      ['Early', 10],
      ['Tie 1', 20],
      ['Tie 2', 20],
    ] as const) {
      await db.comment.create({
        data: { taskId: task.id, body, createdAt: at(minute) },
      })
    }
    const comments = await listComments(task.id)
    expect(comments.map((comment) => comment.body)).toEqual([
      'Early',
      ...comments
        .filter((comment) => comment.body.startsWith('Tie'))
        .sort((a, b) => (a.id < b.id ? -1 : 1))
        .map((comment) => comment.body),
      'Late',
    ])
  })

  it('throws NotFoundError for an unknown task', async () => {
    const error = await listComments(UNKNOWN_ID).catch((caught) => caught)
    expect(error).toBeInstanceOf(NotFoundError)
    expect(error).toMatchObject({ code: 'not_found' })
  })
})

describe('addComment', () => {
  it('adds a comment with a trimmed body', async () => {
    const { task } = await createWebsiteTask()
    const comment = await addComment(task.id, { body: '  Looks good \n' })
    expect(comment).toMatchObject({ taskId: task.id, body: 'Looks good' })
    expect(comment.createdAt).toBeInstanceOf(Date)
    expect(comment.updatedAt).toBeInstanceOf(Date)
    expect(await listComments(task.id)).toEqual([comment])
  })

  it('writes one comment.added row on the task', async () => {
    const { project, task } = await createWebsiteTask()
    let comment: Awaited<ReturnType<typeof addComment>> | undefined
    await nextMillisecond()
    const rows = await newActivity(project.id, async () => {
      comment = await addComment(task.id, { body: 'Looks good' })
    })
    expect(rows).toEqual([
      {
        type: 'comment.added',
        taskId: task.id,
        payload: { number: 1, commentId: comment!.id },
      },
    ])
    expect((await listTaskActivity(task.id)).map((row) => row.type)).toEqual([
      'task.created',
      'comment.added',
    ])
  })

  it('copies no comment text into the log', async () => {
    const { project, task } = await createWebsiteTask()
    const body = 'Short and private'
    const rows = await newActivity(project.id, async () => {
      const comment = await addComment(task.id, { body })
      await updateComment(comment.id, { body: 'Shorter' })
      await deleteComment(comment.id)
    })
    expect(rows).toHaveLength(3)
    for (const row of rows) {
      expect(Object.keys(row.payload as object).sort()).toEqual([
        'commentId',
        'number',
      ])
      expect(JSON.stringify(row.payload)).not.toMatch(/Short/)
    }
  })

  it('throws NotFoundError for an unknown task', async () => {
    await expect(addComment(UNKNOWN_ID, { body: 'Hi' })).rejects.toThrow(
      NotFoundError,
    )
  })

  it('rejects invalid input and writes nothing', async () => {
    const { project, task } = await createWebsiteTask()
    const rows = await newActivity(project.id, async () => {
      await expect(addComment(task.id, { body: '  ' })).rejects.toThrow(
        ZodError,
      )
      await expect(
        addComment(task.id, { body: 'Hi', author: 'me' } as never),
      ).rejects.toThrow(ZodError)
    })
    expect(rows).toEqual([])
    expect(await listComments(task.id)).toEqual([])
  })
})

describe('updateComment', () => {
  it('changes the body with one comment.updated row', async () => {
    const { project, task, comments } = await createTaskWithComments()
    let updated: Awaited<ReturnType<typeof updateComment>> | undefined
    await nextMillisecond()
    const rows = await newActivity(project.id, async () => {
      updated = await updateComment(comments[1].id, { body: '  Beta ' })
    })
    expect(updated).toMatchObject({ id: comments[1].id, body: 'Beta' })
    expect(updated!.updatedAt.getTime()).toBeGreaterThan(
      comments[1].updatedAt.getTime(),
    )
    expect(updated!.createdAt).toEqual(comments[1].createdAt)
    expect(rows).toEqual([
      {
        type: 'comment.updated',
        taskId: task.id,
        payload: { number: 1, commentId: comments[1].id },
      },
    ])
    expect(await bodiesOf(task.id)).toEqual(['A', 'Beta', 'C'])
  })

  it('writes nothing when the body does not change', async () => {
    const { project, comments } = await createTaskWithComments()
    const [first] = comments
    const rows = await newActivity(project.id, async () => {
      expect(await updateComment(first.id, { body: 'A' })).toEqual(first)
      expect(await updateComment(first.id, { body: '  A\n' })).toEqual(first)
    })
    expect(rows).toEqual([])
  })

  it('writes nothing when a stored body differs only in whitespace', async () => {
    const { project, task } = await createWebsiteTask()
    const stored = await db.comment.create({
      data: { taskId: task.id, body: '  Looks good\n' },
    })
    const rows = await newActivity(project.id, async () => {
      expect(await updateComment(stored.id, { body: 'Looks good' })).toEqual(
        stored,
      )
    })
    expect(rows).toEqual([])
  })

  it('throws NotFoundError for an unknown comment', async () => {
    const error = await updateComment(UNKNOWN_ID, { body: 'Hi' }).catch(
      (caught) => caught,
    )
    expect(error).toBeInstanceOf(NotFoundError)
    expect(error.message).toBe(`No comment with id ${UNKNOWN_ID}.`)
  })

  it('rejects invalid input and writes nothing', async () => {
    const { project, comments } = await createTaskWithComments()
    const rows = await newActivity(project.id, async () => {
      await expect(updateComment(comments[0].id, { body: '' })).rejects.toThrow(
        ZodError,
      )
      await expect(updateComment(comments[0].id, {} as never)).rejects.toThrow(
        ZodError,
      )
      await expect(
        updateComment(comments[0].id, { body: 'Hi', taskId: 't' } as never),
      ).rejects.toThrow(ZodError)
    })
    expect(rows).toEqual([])
  })
})

describe('deleteComment', () => {
  it('returns the comment, removes it, and keeps the others in order', async () => {
    const { project, task, comments } = await createTaskWithComments()
    let deleted: unknown
    const rows = await newActivity(project.id, async () => {
      deleted = await deleteComment(comments[1].id)
    })
    expect(deleted).toEqual(comments[1])
    expect(rows).toEqual([
      {
        type: 'comment.deleted',
        taskId: task.id,
        payload: { number: 1, commentId: comments[1].id },
      },
    ])
    expect(await bodiesOf(task.id)).toEqual(['A', 'C'])
  })

  it('throws NotFoundError for an unknown or already deleted comment', async () => {
    const { comments } = await createTaskWithComments()
    await deleteComment(comments[0].id)
    await expect(deleteComment(comments[0].id)).rejects.toThrow(NotFoundError)
    await expect(deleteComment(UNKNOWN_ID)).rejects.toThrow(NotFoundError)
  })
})

describe('activity sentences', () => {
  it('reads every row the service writes as a sentence without its text', async () => {
    const { task } = await createWebsiteTask()
    await nextMillisecond()
    const comment = await addComment(task.id, { body: 'Looks good' })
    await nextMillisecond()
    await updateComment(comment.id, { body: 'Looks great' })
    await nextMillisecond()
    await deleteComment(comment.id)
    const rows = (await listTaskActivity(task.id)).filter((row) =>
      row.type.startsWith('comment.'),
    )
    for (const row of rows) {
      expect(describeActivity(row)).not.toBe(fallbackSentence(row.type))
    }
    expect(rows.map(describeActivity)).toEqual([
      'Added a comment.',
      'Edited a comment.',
      'Deleted a comment.',
    ])
  })
})

describe('with the tasks service', () => {
  it('leaves getTask and listTasks as they were', async () => {
    const { project, task } = await createWebsiteTask()
    const before = {
      one: await getTask(task.id),
      all: await listTasks(project.id),
    }
    await addComment(task.id, { body: 'Looks good' })
    expect(await getTask(task.id)).toEqual(before.one)
    expect(await listTasks(project.id)).toEqual(before.all)
  })

  it('throws NotFoundError for a write that waits on a task delete', async () => {
    const { project } = await createWebsiteTask()
    const writes: Array<
      (taskId: string, commentId: string) => Promise<unknown>
    > = [
      (taskId) => addComment(taskId, { body: 'C' }),
      (_, commentId) => updateComment(commentId, { body: 'Changed' }),
      (_, commentId) => deleteComment(commentId),
    ]
    for (const write of writes) {
      const task = await createTask(project.id, { title: 'Doomed' })
      const comment = await addComment(task.id, { body: 'A' })
      await expect(
        deleteTaskDuring(task.id, () => write(task.id, comment.id)),
      ).rejects.toThrow(NotFoundError)
    }
  })

  it('deletes the comments with their task', async () => {
    const { comments, task } = await createTaskWithComments()
    await deleteTask(task.id)
    expect(await db.comment.count()).toBe(0)
    await expect(
      updateComment(comments[0].id, { body: 'Changed' }),
    ).rejects.toThrow(NotFoundError)
  })
})
