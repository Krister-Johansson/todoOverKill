import { queryOptions } from '@tanstack/react-query'
import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import * as z from 'zod'

import { PROJECTS_QUERY_KEY, hasCode } from '#/fns/projects'
import { projectIdSchema } from '#/schemas/project'
import {
  createTaskSchema,
  listTasksSchema,
  moveTaskSchema,
  taskIdSchema,
} from '#/schemas/task'
import { createTask, getTask, listTasks, moveTask } from '#/server/tasks'

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

/**
 * What createTaskFn returns. A project without statuses is an expected
 * outcome the dialog shows in its summary, so it comes back as a value. Any
 * other error is thrown and reaches the client as a plain Error, including
 * the NotFoundError of a project deleted while the dialog was open, and the
 * dialog shows a generic message.
 */
export type CreateTaskResult =
  | { ok: true; task: Awaited<ReturnType<typeof createTask>> }
  | { ok: false; code: 'conflict'; message: string }

/**
 * Runs a create and maps a ConflictError to the conflict result. Exported so
 * src/fns/tasks.test.ts can check the mapping against the database without
 * calling a server function under Vitest.
 */
export async function toCreateTaskResult(
  create: () => ReturnType<typeof createTask>,
): Promise<CreateTaskResult> {
  try {
    return { ok: true, task: await create() }
  } catch (error) {
    if (hasCode(error, 'conflict')) {
      return { ok: false, code: 'conflict', message: error.message }
    }
    throw error
  }
}

export const createTaskFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({ projectId: projectIdSchema, data: createTaskSchema }),
  )
  .handler(({ data }) =>
    toCreateTaskResult(() => createTask(data.projectId, data.data)),
  )

/**
 * Moves a task to another status, another place in its column, or both, and
 * returns it with its status. Errors are thrown and reach the client as a
 * plain Error: the board's Move menu has no form to show them in, so it rolls
 * back and announces that the move failed.
 */
export const moveTaskFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ taskId: taskIdSchema, data: moveTaskSchema }))
  .handler(({ data }) => moveTask(data.taskId, data.data))

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
