import { queryOptions } from '@tanstack/react-query'
import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'

import { createProjectSchema, projectIdSchema } from '#/schemas/project'
import { createProject, getProject, listProjects } from '#/server/projects'

/**
 * What createProjectFn returns. A taken key is an expected outcome the form
 * shows on the key field, so it comes back as a value: a thrown ConflictError
 * reaches the client as a plain Error and loses its class and code. Any other
 * error is thrown, and the form shows a generic message.
 */
export type CreateProjectResult =
  | { ok: true; project: Awaited<ReturnType<typeof createProject>> }
  | { ok: false; code: 'conflict'; message: string }

function hasCode(error: unknown, code: string): error is Error {
  return error instanceof Error && 'code' in error && error.code === code
}

/**
 * Runs a create and maps a ConflictError to the conflict result. Exported so
 * src/fns/projects.test.ts can check the mapping against the database without
 * calling a server function under Vitest.
 */
export async function toCreateResult(
  create: () => ReturnType<typeof createProject>,
): Promise<CreateProjectResult> {
  try {
    return { ok: true, project: await create() }
  } catch (error) {
    if (hasCode(error, 'conflict')) {
      return { ok: false, code: 'conflict', message: error.message }
    }
    throw error
  }
}

/** Unarchived projects sorted by name, for the sidebar. */
export const listProjectsFn = createServerFn({ method: 'GET' }).handler(() =>
  listProjects(),
)

/** One project with its statuses. A missing project is the route's 404. */
export const getProjectFn = createServerFn({ method: 'GET' })
  .inputValidator(projectIdSchema)
  .handler(async ({ data: id }) => {
    try {
      return await getProject(id)
    } catch (error) {
      if (hasCode(error, 'not_found')) throw notFound()
      throw error
    }
  })

export const createProjectFn = createServerFn({ method: 'POST' })
  .inputValidator(createProjectSchema)
  .handler(({ data }) => toCreateResult(() => createProject(data)))

export const PROJECTS_QUERY_KEY = ['projects'] as const

/** The sidebar list. The _app loader fills it on the server. */
export function projectsQueryOptions() {
  return queryOptions({
    queryKey: PROJECTS_QUERY_KEY,
    queryFn: () => listProjectsFn(),
  })
}

export function projectQueryOptions(id: string) {
  return queryOptions({
    queryKey: [...PROJECTS_QUERY_KEY, id],
    queryFn: () => getProjectFn({ data: id }),
  })
}
