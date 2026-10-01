import { createFileRoute } from '@tanstack/react-router'

import { handle } from '#/lib/rest'
import { listStatuses } from '#/server/statuses'

export const Route = createFileRoute('/api/v1/projects/$projectId/statuses')({
  server: {
    handlers: {
      // The project's statuses in board order.
      GET: ({ params }) =>
        handle(async () => Response.json(await listStatuses(params.projectId))),
    },
  },
})
