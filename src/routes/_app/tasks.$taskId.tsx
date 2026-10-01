import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

import { projectQueryOptions } from '#/fns/projects'
import { taskQueryOptions } from '#/fns/tasks'

// Temporary: gives the board cards a destination. F17 replaces this page with
// the task detail view.
export const Route = createFileRoute('/_app/tasks/$taskId')({
  staticData: { title: 'Task' },
  loader: async ({ context, params }) => {
    const task = await context.queryClient.ensureQueryData(
      taskQueryOptions(params.taskId),
    )
    const project = await context.queryClient.ensureQueryData(
      projectQueryOptions(task.projectId),
    )
    return { task, project }
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData
          ? `${loaderData.project.key}-${loaderData.task.number} ${loaderData.task.title} · ${loaderData.project.name} · todoOverKill`
          : 'Task · todoOverKill',
      },
    ],
  }),
  component: TaskPage,
})

function TaskPage() {
  const { taskId } = Route.useParams()
  const { data: task } = useSuspenseQuery(taskQueryOptions(taskId))
  const { data: project } = useSuspenseQuery(
    projectQueryOptions(task.projectId),
  )

  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold break-words">
        {project.key}-{task.number} {task.title}
      </h1>
      <p className="text-sm break-words">Project: {project.name}</p>
    </div>
  )
}
