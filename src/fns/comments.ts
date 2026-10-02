import { queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'
import * as z from 'zod'

import { orNotFound, taskQueryOptions } from '#/fns/tasks'
import {
  commentIdSchema,
  createCommentSchema,
  updateCommentSchema,
} from '#/schemas/comment'
import { taskIdSchema } from '#/schemas/task'
import {
  addComment,
  deleteComment,
  listComments,
  updateComment,
} from '#/server/comments'

/** A task's comments, oldest first. A missing task is the route's 404. */
export const listCommentsFn = createServerFn({ method: 'GET' })
  .inputValidator(taskIdSchema)
  .handler(({ data: id }) => orNotFound(() => listComments(id)))

// The mutations throw their errors as they are, NotFoundError included, for
// the reason src/fns/subtasks.ts gives: a notFound() thrown from a mutation
// can render the route's 404 instead of reaching the mutation's onError.

/** Adds a comment to the task and returns it. */
export const addCommentFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ taskId: taskIdSchema, data: createCommentSchema }))
  .handler(({ data }) => addComment(data.taskId, data.data))

/** Replaces a comment's body and returns the comment. */
export const updateCommentFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({ commentId: commentIdSchema, data: updateCommentSchema }),
  )
  .handler(({ data }) => updateComment(data.commentId, data.data))

/** Deletes a comment and returns it. */
export const deleteCommentFn = createServerFn({ method: 'POST' })
  .inputValidator(commentIdSchema)
  .handler(({ data: id }) => deleteComment(id))

/**
 * Under the task's key, like the subtasks, so invalidating ['tasks', id]
 * refreshes the comments too.
 */
export function commentsQueryOptions(taskId: string) {
  return queryOptions({
    queryKey: [...taskQueryOptions(taskId).queryKey, 'comments'],
    queryFn: () => listCommentsFn({ data: taskId }),
  })
}
