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
} as const

export type ActivityType = (typeof ACTIVITY_TYPES)[keyof typeof ACTIVITY_TYPES]
