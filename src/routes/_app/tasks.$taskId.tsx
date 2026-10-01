import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

import { TaskDetail } from '#/components/app/task-detail'
import { projectQueryOptions } from '#/fns/projects'
import { taskQueryOptions } from '#/fns/tasks'
import { toCalendarDay } from '#/lib/dates'

export const Route = createFileRoute('/_app/tasks/$taskId')({
  staticData: { title: 'Task' },
  // Today comes from the loader, as on the board, so the server render and
  // hydration agree on the Overdue word.
  loader: async ({ context, params }) => {
    const task = await context.queryClient.ensureQueryData(
      taskQueryOptions(params.taskId),
    )
    const project = await context.queryClient.ensureQueryData(
      projectQueryOptions(task.projectId),
    )
    return { task, project, today: toCalendarDay(new Date()) }
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData
          ? `${loaderData.task.title} · ${loaderData.project.name} · todoOverKill`
          : 'Task · todoOverKill',
      },
    ],
  }),
  component: TaskPage,
})

function TaskPage() {
  const { taskId } = Route.useParams()
  const { today } = Route.useLoaderData()
  const { data: task } = useSuspenseQuery(taskQueryOptions(taskId))
  const { data: project } = useSuspenseQuery(
    projectQueryOptions(task.projectId),
  )

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <h1 className="text-2xl font-semibold break-words">
        {project.key}-{task.number} {task.title}
      </h1>
      <TaskDetail
        task={task}
        project={project}
        today={today}
        headingLevel={2}
      />
    </div>
  )
}
