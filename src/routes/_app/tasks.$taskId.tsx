import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

import { ActivityLog } from '#/components/app/activity-log'
import { CommentList } from '#/components/app/comment-list'
import { SubtaskList } from '#/components/app/subtask-list'
import { TaskDetail } from '#/components/app/task-detail'
import { commentsQueryOptions } from '#/fns/comments'
import { projectQueryOptions } from '#/fns/projects'
import { subtasksQueryOptions } from '#/fns/subtasks'
import { taskActivityQueryOptions, taskQueryOptions } from '#/fns/tasks'
import { toCalendarDay } from '#/lib/dates'

export const Route = createFileRoute('/_app/tasks/$taskId')({
  staticData: { title: 'Task' },
  // Today and now come from the loader, as on the board, so the server render
  // and hydration agree on the Overdue word and the activity's relative times.
  loader: async ({ context, params }) => {
    const [task] = await Promise.all([
      context.queryClient.ensureQueryData(taskQueryOptions(params.taskId)),
      context.queryClient.ensureQueryData(
        taskActivityQueryOptions(params.taskId),
      ),
      context.queryClient.ensureQueryData(subtasksQueryOptions(params.taskId)),
      context.queryClient.ensureQueryData(commentsQueryOptions(params.taskId)),
    ])
    const project = await context.queryClient.ensureQueryData(
      projectQueryOptions(task.projectId),
    )
    const now = new Date()
    return {
      task,
      project,
      today: toCalendarDay(now),
      now: now.toISOString(),
    }
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
  const { today, now } = Route.useLoaderData()
  const { data: task } = useSuspenseQuery(taskQueryOptions(taskId))
  const { data: activity } = useSuspenseQuery(taskActivityQueryOptions(taskId))
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
      <SubtaskList taskId={taskId} headingLevel={2} />
      <CommentList taskId={taskId} now={new Date(now)} headingLevel={2} />
      <ActivityLog rows={activity} now={new Date(now)} headingLevel={2} />
    </div>
  )
}
