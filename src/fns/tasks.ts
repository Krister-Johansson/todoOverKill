import { queryOptions } from '@tanstack/react-query'
import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import * as z from 'zod'

import { PROJECTS_QUERY_KEY } from '#/fns/projects'
import { projectIdSchema } from '#/schemas/project'
import { listTasksSchema, taskIdSchema } from '#/schemas/task'
import { getTask, listTasks } from '#/server/tasks'

/** Turns the service's NotFoundError into the route's 404. */
async function orNotFound<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load()
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'not_found')
      throw notFound()
    throw error
  }
}

/** A project's tasks in board order. A missing project is the route's 404. */
export const listTasksFn = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      projectId: projectIdSchema,
      filters: listTasksSchema.optional(),
    }),
  )
  .handler(({ data }) =>
    orNotFound(() => listTasks(data.projectId, data.filters)),
  )

/** One task with its status and labels. A missing task is the route's 404. */
export const getTaskFn = createServerFn({ method: 'GET' })
  .inputValidator(taskIdSchema)
  .handler(({ data: id }) => orNotFound(() => getTask(id)))

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
