import type { Prisma } from '#/generated/prisma/client'
import {
  commentIdSchema,
  createCommentSchema,
  updateCommentSchema,
} from '#/schemas/comment'
import type { CreateCommentInput, UpdateCommentInput } from '#/schemas/comment'
import { taskIdSchema } from '#/schemas/task'
import { ACTIVITY_TYPES } from '#/server/activity'
import { db } from '#/server/db'
import { NotFoundError } from '#/server/errors'

/** Oldest first. The id only makes ties between comments of one moment stable. */
const commentOrder = [
  { createdAt: 'asc' },
  { id: 'asc' },
] as const satisfies Array<Prisma.CommentOrderByWithRelationInput>

function taskNotFound(id: string) {
  return new NotFoundError(`No task with id ${id}.`)
}

function commentNotFound(id: string) {
  return new NotFoundError(`No comment with id ${id}.`)
}

// Every mutation locks its task's row first, as the subtasks service does, so
// writes to one task's comments run one after another, and a write that
// waited on deleteTask finds the task gone and throws NotFoundError instead of
// deadlocking on the cascade. Writers queue on the row while holding a pooled
// connection, so the transactions get createTask's longer limits.
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
 * Locks the comment's task and reads the comment again under the lock, so it
 * is the committed row the previous writer left. Throws NotFoundError when the
 * comment, or its task, is gone.
 */
async function lockComment(tx: Prisma.TransactionClient, id: string) {
  const found = await tx.comment.findUnique({
    where: { id },
    select: { taskId: true },
  })
  const task = found && (await lockTask(tx, found.taskId))
  const comment = task && (await tx.comment.findUnique({ where: { id } }))
  if (!task || !comment) throw commentNotFound(id)
  return { task, comment }
}

// Every mutation writes one activity row on the task, with its project, in the
// same transaction. The payload holds the task number and the comment's id,
// never its text, so editing or deleting a comment leaves no copy of the old
// text in the log. A call that changes nothing writes no row.

/** A task's comments, oldest first. Throws NotFoundError for an unknown task. */
export async function listComments(taskId: string) {
  const id = taskIdSchema.parse(taskId)
  const task = await db.task.findUnique({
    where: { id },
    select: { comments: { orderBy: commentOrder } },
  })
  if (!task) throw taskNotFound(id)
  return task.comments
}

/**
 * Adds a comment to the task and writes a `comment.added` row. Throws
 * NotFoundError for an unknown task.
 */
export async function addComment(taskId: string, input: CreateCommentInput) {
  const id = taskIdSchema.parse(taskId)
  const { body } = createCommentSchema.parse(input)
  return db.$transaction(async (tx) => {
    const task = await lockTask(tx, id)
    if (!task) throw taskNotFound(id)
    const comment = await tx.comment.create({ data: { taskId: id, body } })
    await tx.activity.create({
      data: {
        projectId: task.projectId,
        taskId: id,
        type: ACTIVITY_TYPES.commentAdded,
        payload: { number: task.number, commentId: comment.id },
      },
    })
    return comment
  }, lockedTransaction)
}

/**
 * Replaces the body and writes a `comment.updated` row. The body is compared
 * after trimming, so an update with the current body returns the comment
 * unchanged and writes nothing. Throws NotFoundError.
 */
export async function updateComment(id: string, input: UpdateCommentInput) {
  const commentId = commentIdSchema.parse(id)
  const { body } = updateCommentSchema.parse(input)
  return db.$transaction(async (tx) => {
    const { task, comment } = await lockComment(tx, commentId)
    if (body === comment.body) return comment
    const updated = await tx.comment.update({
      where: { id: commentId },
      data: { body },
    })
    await tx.activity.create({
      data: {
        projectId: task.projectId,
        taskId: comment.taskId,
        type: ACTIVITY_TYPES.commentUpdated,
        payload: { number: task.number, commentId },
      },
    })
    return updated
  }, lockedTransaction)
}

/**
 * Deletes the comment, writes a `comment.deleted` row, and returns the deleted
 * comment. Throws NotFoundError.
 */
export async function deleteComment(id: string) {
  const commentId = commentIdSchema.parse(id)
  return db.$transaction(async (tx) => {
    const { task, comment } = await lockComment(tx, commentId)
    await tx.comment.delete({ where: { id: commentId } })
    await tx.activity.create({
      data: {
        projectId: task.projectId,
        taskId: comment.taskId,
        type: ACTIVITY_TYPES.commentDeleted,
        payload: { number: task.number, commentId },
      },
    })
    return comment
  }, lockedTransaction)
}
