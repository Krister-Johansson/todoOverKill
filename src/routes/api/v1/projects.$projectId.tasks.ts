import { createFileRoute } from '@tanstack/react-router'

import { dueFilterRange, toCalendarDay } from '#/lib/dates'
import { handle, readJsonBody } from '#/lib/rest'
import { createTaskSchema, listTasksQuerySchema } from '#/schemas/task'
import { createTask, listTasks } from '#/server/tasks'

// Start runs the handlers of the deepest matching route only, so this child of
// /api/v1/projects/$projectId does not inherit its GET, PATCH and DELETE.
export const Route = createFileRoute('/api/v1/projects/$projectId/tasks')({
  server: {
    handlers: {
      // The project's tasks in board order, filtered by F23's names: status,
      // priority, label, due (overdue, today, week) and q.
      GET: ({ request, params }) =>
        handle(async () => {
          // fromEntries keeps the last value of a repeated parameter, so
          // ?status=a&status=b filters by b.
          const query = Object.fromEntries(new URL(request.url).searchParams)
          const { status, label, due, ...filters } =
            listTasksQuerySchema.parse(query)
          // Today is the server's local calendar day. The app is local, so
          // the server and the browser share a zone.
          const range = due
            ? dueFilterRange(due, toCalendarDay(new Date()))
            : {}
          const tasks = await listTasks(params.projectId, {
            ...filters,
            statusId: status,
            labelId: label,
            ...range,
          })
          return Response.json(tasks)
        }),
      // The task with the project's next number, and 201. Without a statusId
      // it goes to the end of the project's first status.
      POST: ({ request, params }) =>
        handle(async () => {
          const input = createTaskSchema.parse(await readJsonBody(request))
          return Response.json(await createTask(params.projectId, input), {
            status: 201,
          })
        }),
    },
  },
})
