import { queryOptions } from '@tanstack/react-query'
import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'

import { PROJECTS_QUERY_KEY, hasCode } from '#/fns/projects'
import { projectIdSchema } from '#/schemas/project'
import { listLabels } from '#/server/labels'

/** A project's labels sorted by name. A missing project is the route's 404. */
export const listLabelsFn = createServerFn({ method: 'GET' })
  .inputValidator(projectIdSchema)
  .handler(async ({ data: projectId }) => {
    try {
      return await listLabels(projectId)
    } catch (error) {
      if (hasCode(error, 'not_found')) throw notFound()
      throw error
    }
  })

/**
 * Keyed under the project, so invalidating `projectQueryOptions(id)` refreshes
 * its labels too.
 */
export function labelsQueryOptions(projectId: string) {
  return queryOptions({
    queryKey: [...PROJECTS_QUERY_KEY, projectId, 'labels'],
    queryFn: () => listLabelsFn({ data: projectId }),
  })
}
