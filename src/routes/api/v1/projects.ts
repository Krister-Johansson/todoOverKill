import { createFileRoute } from '@tanstack/react-router'

import { handle, readJsonBody } from '#/lib/rest'
import { createProjectSchema, listProjectsQuerySchema } from '#/schemas/project'
import { createProject, listProjects } from '#/server/projects'

export const Route = createFileRoute('/api/v1/projects')({
  server: {
    handlers: {
      // Unarchived projects sorted by name; ?includeArchived=true adds the rest.
      GET: ({ request }) =>
        handle(async () => {
          // fromEntries leaves an absent parameter undefined, so the schema
          // default applies. searchParams.get would give null, which fails.
          const query = Object.fromEntries(new URL(request.url).searchParams)
          const input = listProjectsQuerySchema.parse(query)
          return Response.json(await listProjects(input))
        }),
      // The project with its four default statuses, and 201.
      POST: ({ request }) =>
        handle(async () => {
          const input = createProjectSchema.parse(await readJsonBody(request))
          return Response.json(await createProject(input), { status: 201 })
        }),
    },
  },
})
