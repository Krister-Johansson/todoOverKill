import { createFileRoute } from '@tanstack/react-router'

import { handle, readJsonBody } from '#/lib/rest'
import { updateProjectSchema } from '#/schemas/project'
import { archiveProject, getProject, updateProject } from '#/server/projects'

// Start runs the handlers of the deepest matching route only, so this child of
// /api/v1/projects does not inherit its GET and POST.
export const Route = createFileRoute('/api/v1/projects/$projectId')({
  server: {
    handlers: {
      // The project with its statuses in board order.
      GET: ({ params }) =>
        handle(async () => Response.json(await getProject(params.projectId))),
      // Changes the given fields; null clears the description or colour.
      PATCH: ({ request, params }) =>
        handle(async () => {
          const patch = updateProjectSchema.parse(await readJsonBody(request))
          return Response.json(await updateProject(params.projectId, patch))
        }),
      // Archives rather than deletes, and returns the archived project.
      // Archiving an archived project changes nothing.
      DELETE: ({ params }) =>
        handle(async () =>
          Response.json(await archiveProject(params.projectId)),
        ),
    },
  },
})
