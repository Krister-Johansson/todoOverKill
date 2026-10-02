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
import { NotFoundError, isPrismaError } from '#/server/errors'

/** Top to bottom. The id only makes ties stable; the service never writes them. */
const subtaskOrder = [
  { order: 'asc' },
  { id: 'asc' },
] as const satisfies Array<Prisma.SubtaskOrderByWithRelationInput>

/** The task fields an activity row needs. */
const withTask = {
  task: { select: { projectId: true, number: true } },
} as const satisfies Prisma.SubtaskInclude

function taskNotFound(id: string) {
  return new NotFoundError(`No task with id ${id}.`)
}

function subtaskNotFound(id: string) {
  return new NotFoundError(`No subtask with id ${id}.`)
}

/**
 * Runs `work` and turns Prisma's P2025, which a write raises when the subtask
 * (or its task) was deleted after the transaction read it, into the subtask's
 * NotFoundError.
 */
async function orSubtaskNotFound<T>(id: string, work: () => Promise<T>) {
  try {
    return await work()
  } catch (error) {
    // The failed write aborts the transaction, so the catch sits outside it.
    if (isPrismaError(error, 'P2025')) throw subtaskNotFound(id)
    throw error
  }
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
  try {
    return await db.$transaction(async (tx) => {
      const task = await tx.task.findUnique({
        where: { id },
        select: { projectId: true, number: true },
      })
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
    })
  } catch (error) {
    // A task deleted after the read trips the subtask's foreign key.
    if (isPrismaError(error, 'P2003')) throw taskNotFound(id)
    throw error
  }
}

/**
 * Changes the title, the done state, or both, and writes one row: a change of
 * `done` alone is `subtask.completed` or `subtask.reopened`, anything else is
 * `subtask.updated` naming the fields that changed. The title is compared
 * after trimming, so an update with the current values, `{}` among them,
 * writes nothing. Throws NotFoundError.
 */
export async function updateSubtask(id: string, patch: UpdateSubtaskInput) {
  const subtaskId = subtaskIdSchema.parse(id)
  const data = updateSubtaskSchema.parse(patch)
  return orSubtaskNotFound(subtaskId, () =>
    db.$transaction(async (tx) => {
      const found = await tx.subtask.findUnique({
        where: { id: subtaskId },
        include: withTask,
      })
      if (!found) throw subtaskNotFound(subtaskId)
      const { task, ...subtask } = found
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
                payload: { ...payload, fields },
              }),
        },
      })
      return updated
    }),
  )
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
  return orSubtaskNotFound(subtaskId, () =>
    db.$transaction(async (tx) => {
      const found = await tx.subtask.findUnique({
        where: { id: subtaskId },
        include: withTask,
      })
      if (!found) throw subtaskNotFound(subtaskId)
      const { task, ...subtask } = found
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
      let moved = subtask
      for (const [position, row] of others.entries()) {
        if (row.id === subtaskId) {
          // update rather than updateMany, so a subtask deleted meanwhile
          // raises P2025 instead of writing a row for a move that did not
          // happen.
          moved = await tx.subtask.update({
            where: { id: subtaskId },
            data: { order: position + 1 },
          })
        } else if (row.order !== position + 1) {
          // updateMany skips a sibling deleted in the meantime.
          await tx.subtask.updateMany({
            where: { id: row.id },
            data: { order: position + 1 },
          })
        }
      }
      await tx.activity.create({
        data: {
          projectId: task.projectId,
          taskId: subtask.taskId,
          type: ACTIVITY_TYPES.subtaskMoved,
          payload: { number: task.number, title: subtask.title, from, to },
        },
      })
      return moved
    }),
  )
}

/**
 * Deletes the subtask, writes a `subtask.deleted` row, and returns the deleted
 * subtask. The other subtasks keep their `order`. Throws NotFoundError.
 */
export async function deleteSubtask(id: string) {
  const subtaskId = subtaskIdSchema.parse(id)
  return orSubtaskNotFound(subtaskId, () =>
    db.$transaction(async (tx) => {
      const found = await tx.subtask.findUnique({
        where: { id: subtaskId },
        include: withTask,
      })
      if (!found) throw subtaskNotFound(subtaskId)
      const { task, ...subtask } = found
      // The delete goes first, so a subtask or task deleted meanwhile is a
      // P2025 here rather than a foreign key error on the activity row.
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
    }),
  )
}
