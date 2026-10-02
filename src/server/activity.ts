import { taskIdSchema } from '#/schemas/task'
import { db } from '#/server/db'
import { NotFoundError } from '#/server/errors'

/**
 * Every activity type the service layer writes. The seed uses the same values,
 * so demo data and real data read alike in the activity feed.
 */
export const ACTIVITY_TYPES = {
  projectCreated: 'project.created',
  projectArchived: 'project.archived',
  taskCreated: 'task.created',
  taskUpdated: 'task.updated',
  taskMoved: 'task.moved',
  taskCompleted: 'task.completed',
  taskDeleted: 'task.deleted',
  commentAdded: 'comment.added',
  subtaskAdded: 'subtask.added',
  subtaskUpdated: 'subtask.updated',
  subtaskCompleted: 'subtask.completed',
  subtaskReopened: 'subtask.reopened',
  subtaskMoved: 'subtask.moved',
  subtaskDeleted: 'subtask.deleted',
} as const

export type ActivityType = (typeof ACTIVITY_TYPES)[keyof typeof ACTIVITY_TYPES]

/**
 * A task's activity rows, oldest first. The id only makes ties between rows
 * of the same moment stable; it is random, so their order is arbitrary, not
 * write order. A deleted task's rows keep only their
 * project, so they are not part of this read. Throws NotFoundError for an
 * unknown task.
 */
export async function listTaskActivity(id: string) {
  const taskId = taskIdSchema.parse(id)
  const task = await db.task.findUnique({
    where: { id: taskId },
    select: {
      activities: {
        select: { id: true, type: true, payload: true, createdAt: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      },
    },
  })
  if (!task) throw new NotFoundError(`No task with id ${taskId}.`)
  return task.activities
}
