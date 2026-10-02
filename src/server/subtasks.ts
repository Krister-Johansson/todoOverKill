import type { Prisma } from '#/generated/prisma/client'
import {
  createSubtaskSchema,
  moveSubtaskSchema,
  subtaskIdSchema,
  updateSubtaskSchema,
} from '#/schemas/subtask'
import type {
  CreateSubtaskInput,
  MoveSubtaskInput,
  UpdateSubtaskInput,
} from '#/schemas/subtask'
import { taskIdSchema } from '#/schemas/task'
import { ACTIVITY_TYPES } from '#/server/activity'
import { db } from '#/server/db'
import { NotFoundError } from '#/server/errors'

/** Top to bottom. The id only makes ties stable; the service never writes them. */
const subtaskOrder = [
  { order: 'asc' },
  { id: 'asc' },
] as const satisfies Array<Prisma.SubtaskOrderByWithRelationInput>

function taskNotFound(id: string) {
  return new NotFoundError(`No task with id ${id}.`)
}

function subtaskNotFound(id: string) {
  return new NotFoundError(`No subtask with id ${id}.`)
}

// Every mutation locks its task's row first, so writes to one task's subtasks
// run one after another: two adds get distinct orders, two moves each start
// from the order the other committed, and a write that waited on deleteTask
// finds the task gone and throws NotFoundError instead of deadlocking on the
// cascade. Writers queue on the row while holding a pooled connection, so the
// transactions get createTask's longer limits.
const lockedTransaction = {
  maxWait: 10_000,
  timeout: 10_000,
} as const

/**
 * Locks the task's row until the transaction ends and returns the fields an
 * activity row needs, or undefined when the task does not exist.
 */
async function lockTask(tx: Prisma.TransactionClient, taskId: string) {
  const rows = await tx.$queryRaw<
    Array<{ projectId: string; number: number }>
  >`SELECT "projectId", "number" FROM "Task" WHERE "id" = ${taskId} FOR UPDATE`
  return rows.at(0)
}

/**
 * Locks the subtask's task and reads the subtask again under the lock, so it
 * is the committed row the previous writer left. Throws NotFoundError when the
 * subtask, or its task, is gone.
 */
async function lockSubtask(tx: Prisma.TransactionClient, id: string) {
  const found = await tx.subtask.findUnique({
    where: { id },
    select: { taskId: true },
  })
  const task = found && (await lockTask(tx, found.taskId))
  const subtask = task && (await tx.subtask.findUnique({ where: { id } }))
  if (!task || !subtask) throw subtaskNotFound(id)
  return { task, subtask }
}

// Every mutation writes one activity row on the task, with its project, in the
// same transaction. A call that changes nothing writes no row.

/** A task's subtasks, top to bottom. Throws NotFoundError for an unknown task. */
export async function listSubtasks(taskId: string) {
  const id = taskIdSchema.parse(taskId)
  const task = await db.task.findUnique({
    where: { id },
    select: { subtasks: { orderBy: subtaskOrder } },
  })
  if (!task) throw taskNotFound(id)
  return task.subtasks
}

/**
 * Adds a subtask at the end of the task's list, not done, and writes a
 * `subtask.added` row. Throws NotFoundError for an unknown task.
 */
export async function addSubtask(taskId: string, input: CreateSubtaskInput) {
  const id = taskIdSchema.parse(taskId)
  const { title } = createSubtaskSchema.parse(input)
  return db.$transaction(async (tx) => {
    const task = await lockTask(tx, id)
    if (!task) throw taskNotFound(id)
    const { _max } = await tx.subtask.aggregate({
      where: { taskId: id },
      _max: { order: true },
    })
    const subtask = await tx.subtask.create({
      data: { taskId: id, title, order: (_max.order ?? 0) + 1 },
    })
    await tx.activity.create({
      data: {
        projectId: task.projectId,
        taskId: id,
        type: ACTIVITY_TYPES.subtaskAdded,
        payload: { number: task.number, title },
      },
    })
    return subtask
  }, lockedTransaction)
}

/**
 * Changes the title, the done state, or both, and writes one row: a change of
 * `done` alone is `subtask.completed` or `subtask.reopened`, anything else is
 * `subtask.updated` naming the fields that changed, with the new `done` when
 * it is one of them. The title is compared after trimming, so an update with
 * the current values, `{}` among them, writes nothing. Throws NotFoundError.
 */
export async function updateSubtask(id: string, patch: UpdateSubtaskInput) {
  const subtaskId = subtaskIdSchema.parse(id)
  const data = updateSubtaskSchema.parse(patch)
  return db.$transaction(async (tx) => {
    const { task, subtask } = await lockSubtask(tx, subtaskId)
    const changes: Prisma.SubtaskUpdateInput = {}
    const fields: Array<'title' | 'done'> = []
    if (data.title !== undefined && data.title !== subtask.title) {
      changes.title = data.title
      fields.push('title')
    }
    if (data.done !== undefined && data.done !== subtask.done) {
      changes.done = data.done
      fields.push('done')
    }
    if (fields.length === 0) return subtask
    const updated = await tx.subtask.update({
      where: { id: subtaskId },
      data: changes,
    })
    const payload = { number: task.number, title: updated.title }
    await tx.activity.create({
      data: {
        projectId: task.projectId,
        taskId: subtask.taskId,
        ...(fields.length === 1 && fields[0] === 'done'
          ? {
              type: updated.done
                ? ACTIVITY_TYPES.subtaskCompleted
                : ACTIVITY_TYPES.subtaskReopened,
              payload,
            }
          : {
              type: ACTIVITY_TYPES.subtaskUpdated,
              payload: {
                ...payload,
                fields,
                ...(fields.includes('done') && { done: updated.done }),
              },
            }),
      },
    })
    return updated
  }, lockedTransaction)
}

/**
 * Moves the subtask to `index` among the task's other subtasks, so 0 is the
 * top and an index past the end is the end, and writes a `subtask.moved` row
 * with the old and new index. The task's subtasks are rewritten as 1..n, which
 * keeps `order` whole and costs one update per subtask that shifts. A move to
 * the subtask's own place writes nothing. Throws NotFoundError.
 */
export async function moveSubtask(id: string, input: MoveSubtaskInput) {
  const subtaskId = subtaskIdSchema.parse(id)
  const { index } = moveSubtaskSchema.parse(input)
  return db.$transaction(async (tx) => {
    const { task, subtask } = await lockSubtask(tx, subtaskId)
    const all = await tx.subtask.findMany({
      where: { taskId: subtask.taskId },
      orderBy: subtaskOrder,
      select: { id: true, order: true },
    })
    const from = all.findIndex((row) => row.id === subtaskId)
    const others = all.filter((row) => row.id !== subtaskId)
    const to = Math.min(index, others.length)
    if (to === from) return subtask
    others.splice(to, 0, { id: subtaskId, order: subtask.order })
    for (const [position, row] of others.entries()) {
      if (row.order === position + 1) continue
      await tx.subtask.update({
        where: { id: row.id },
        data: { order: position + 1 },
      })
    }
    await tx.activity.create({
      data: {
        projectId: task.projectId,
        taskId: subtask.taskId,
        type: ACTIVITY_TYPES.subtaskMoved,
        payload: { number: task.number, title: subtask.title, from, to },
      },
    })
    return { ...subtask, order: to + 1 }
  }, lockedTransaction)
}

/**
 * Deletes the subtask, writes a `subtask.deleted` row, and returns the deleted
 * subtask. The other subtasks keep their `order`. Throws NotFoundError.
 */
export async function deleteSubtask(id: string) {
  const subtaskId = subtaskIdSchema.parse(id)
  return db.$transaction(async (tx) => {
    const { task, subtask } = await lockSubtask(tx, subtaskId)
    await tx.subtask.delete({ where: { id: subtaskId } })
    await tx.activity.create({
      data: {
        projectId: task.projectId,
        taskId: subtask.taskId,
        type: ACTIVITY_TYPES.subtaskDeleted,
        payload: { number: task.number, title: subtask.title },
      },
    })
    return subtask
  }, lockedTransaction)
}
