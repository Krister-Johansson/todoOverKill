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
import { listTaskActivity } from '#/server/activity'
import { createTask, getTask, listTasks, moveTask } from '#/server/tasks'

import type { NotFoundEntity } from '#/server/errors'

/** Turns the service's NotFoundError into the route's 404. */
export async function orNotFound<T>(load: () => Promise<T>): Promise<T> {
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

/** A task's activity rows, oldest first. A missing task is the route's 404. */
export const listTaskActivityFn = createServerFn({ method: 'GET' })
  .inputValidator(taskIdSchema)
  .handler(({ data: id }) => orNotFound(() => listTaskActivity(id)))

/**
 * What createTaskFn returns. A project without statuses, and a project or
 * status deleted while the dialog was open, are expected outcomes the dialog
 * shows in its summary, so they come back as values; `entity` says which
 * record was missing, so the dialog can say what to do. Any other error is
 * thrown and reaches the client as a plain Error, and the dialog shows a
 * generic message.
 */
export type CreateTaskResult =
  | { ok: true; task: Awaited<ReturnType<typeof createTask>> }
  | { ok: false; code: 'conflict'; message: string }
  | {
      ok: false
      code: 'not_found'
      entity: NotFoundEntity | undefined
      message: string
    }

/**
 * Runs a create and maps a ConflictError to the conflict result and a
 * NotFoundError to the not_found result. Exported so src/fns/tasks.test.ts can
 * check the mapping against the database without calling a server function
 * under Vitest.
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
    // By code rather than instanceof NotFoundError: the client bundle loads
    // this module, and importing src/server/errors.ts would bring Prisma in.
    if (hasCode(error, 'not_found')) {
      const { entity } = error as Error & { entity?: NotFoundEntity }
      return { ok: false, code: 'not_found', entity, message: error.message }
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

/**
 * Under the task's key, so the board's Move menu, which invalidates
 * ['tasks', id] without `exact`, refreshes the activity log too.
 */
export function taskActivityQueryOptions(taskId: string) {
  return queryOptions({
    queryKey: [...taskQueryOptions(taskId).queryKey, 'activity'],
    queryFn: () => listTaskActivityFn({ data: taskId }),
  })
}
