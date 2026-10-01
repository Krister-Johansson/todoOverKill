import { createFileRoute } from '@tanstack/react-router'

import { handle, readJsonBody } from '#/lib/rest'
import { patchTaskSchema } from '#/schemas/task'
import { deleteTask, getTask, moveTask, updateTask } from '#/server/tasks'

export const Route = createFileRoute('/api/v1/tasks/$taskId')({
  server: {
    handlers: {
      // The task with its status and labels.
      GET: ({ params }) =>
        handle(async () => Response.json(await getTask(params.taskId))),
      // Changes the given fields and moves the task when the body has a
      // statusId or an index. The whole body is parsed first, so an invalid
      // field is a 400 before anything is written.
      PATCH: ({ request, params }) =>
        handle(async () => {
          const { statusId, index, ...fields } = patchTaskSchema.parse(
            await readJsonBody(request),
          )
          const hasMove = statusId !== undefined || index !== undefined
          // Zod leaves an absent optional field out, and JSON has no undefined.
          const hasFields = Object.keys(fields).length > 0
          if (!hasMove && !hasFields) {
            return Response.json(await getTask(params.taskId))
          }
          // The move goes first because it is the only call that can fail on
          // the caller's input (a status outside the project), so a rejected
          // move leaves the task and its activity untouched. The update after
          // it fails only when the task was deleted in between: the two are
          // separate transactions, so the move is kept and the client gets
          // a 404.
          let task = hasMove
            ? await moveTask(params.taskId, { statusId, index })
            : undefined
          if (hasFields) task = await updateTask(params.taskId, fields)
          return Response.json(task)
        }),
      // Deletes the task for real and returns it. Its activity rows stay in
      // the project history.
      DELETE: ({ params }) =>
        handle(async () => Response.json(await deleteTask(params.taskId))),
    },
  },
})
