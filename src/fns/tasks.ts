import { queryOptions } from '@tanstack/react-query'
import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import * as z from 'zod'

import { PROJECTS_QUERY_KEY } from '#/fns/projects'
import { projectIdSchema } from '#/schemas/project'
import { listTasksSchema, taskIdSchema } from '#/schemas/task'
import { getTask, listTasks } from '#/server/tasks'

function isNotFound(error: unknown) {
  return error instanceof Error && 'code' in error && error.code === 'not_found'
}

/** A project's tasks in board order. A missing project is the route's 404. */
export const listTasksFn = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      projectId: projectIdSchema,
      filters: listTasksSchema.optional(),
    }),
  )
  .handler(async ({ data }) => {
    try {
      return await listTasks(data.projectId, data.filters)
    } catch (error) {
      if (isNotFound(error)) throw notFound()
      throw error
    }
  })

/** One task with its status and labels. A missing task is the route's 404. */
export const getTaskFn = createServerFn({ method: 'GET' })
  .inputValidator(taskIdSchema)
  .handler(async ({ data: id }) => {
    try {
      return await getTask(id)
    } catch (error) {
      if (isNotFound(error)) throw notFound()
      throw error
    }
  })

/** Under the project's key, so invalidating a project refreshes its tasks. */
export function tasksQueryOptions(projectId: string) {
  return queryOptions({
    queryKey: [...PROJECTS_QUERY_KEY, projectId, 'tasks'],
    queryFn: () => listTasksFn({ data: { projectId } }),
  })
}

export function taskQueryOptions(taskId: string) {
  return queryOptions({
    queryKey: ['tasks', taskId],
    queryFn: () => getTaskFn({ data: taskId }),
  })
}
