import { queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'
import * as z from 'zod'

import { orNotFound, taskQueryOptions } from '#/fns/tasks'
import {
  createSubtaskSchema,
  subtaskIdSchema,
  updateSubtaskSchema,
} from '#/schemas/subtask'
import { taskIdSchema } from '#/schemas/task'
import {
  addSubtask,
  deleteSubtask,
  listSubtasks,
  updateSubtask,
} from '#/server/subtasks'

/** A task's subtasks, top to bottom. A missing task is the route's 404. */
export const listSubtasksFn = createServerFn({ method: 'GET' })
  .inputValidator(taskIdSchema)
  .handler(({ data: id }) => orNotFound(() => listSubtasks(id)))

// The mutations below throw their errors as they are, NotFoundError included,
// and do not go through orNotFound: a notFound() thrown from a mutation can
// render the route's 404 instead of reaching the mutation's onError, which
// rolls back and announces that the change failed.

/** Adds a subtask at the end of the task's list and returns it. */
export const addSubtaskFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ taskId: taskIdSchema, data: createSubtaskSchema }))
  .handler(({ data }) => addSubtask(data.taskId, data.data))

/** Renames a subtask, marks it done or not done, or both, and returns it. */
export const updateSubtaskFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({ subtaskId: subtaskIdSchema, data: updateSubtaskSchema }),
  )
  .handler(({ data }) => updateSubtask(data.subtaskId, data.data))

/** Deletes a subtask and returns it. */
export const deleteSubtaskFn = createServerFn({ method: 'POST' })
  .inputValidator(subtaskIdSchema)
  .handler(({ data: id }) => deleteSubtask(id))

/**
 * Under the task's key, so the board's Move menu, which invalidates
 * ['tasks', id] without `exact`, refreshes the subtasks too.
 */
export function subtasksQueryOptions(taskId: string) {
  return queryOptions({
    queryKey: [...taskQueryOptions(taskId).queryKey, 'subtasks'],
    queryFn: () => listSubtasksFn({ data: taskId }),
  })
}
