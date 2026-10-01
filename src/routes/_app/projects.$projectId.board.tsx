import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

import { BoardColumn } from '#/components/app/board-column'
import { projectQueryOptions } from '#/fns/projects'
import { tasksQueryOptions } from '#/fns/tasks'
import { toCalendarDay } from '#/lib/dates'

import type { BoardTask } from '#/components/app/task-card'

// The read-only board. It sets no head, so the tab keeps the layout's project
// title.
export const Route = createFileRoute('/_app/projects/$projectId/board')({
  staticData: { title: 'Board' },
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(
      tasksQueryOptions(params.projectId),
    )
    // Today for the Overdue word. It travels with the loader data, so the
    // server render and hydration use the same day.
    return { today: toCalendarDay(new Date()) }
  },
  component: BoardPage,
})

function BoardPage() {
  const { projectId } = Route.useParams()
  const { today } = Route.useLoaderData()
  const { data: project } = useSuspenseQuery(projectQueryOptions(projectId))
  const { data: tasks } = useSuspenseQuery(tasksQueryOptions(projectId))

  const byStatus = new Map<string, Array<BoardTask>>()
  for (const task of tasks) {
    const column = byStatus.get(task.statusId)
    if (column) column.push(task)
    else byStatus.set(task.statusId, [task])
  }

  // From md the columns sit in a row that scrolls inside this region, never
  // the page. The region is focusable so keyboard users can scroll it even
  // when it holds no links.
  return (
    <div
      role="region"
      aria-label="Board columns"
      tabIndex={0}
      className="min-w-0 md:overflow-x-auto md:pb-2"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        {/* getProject returns the statuses sorted by Status.order. */}
        {project.statuses.map((status) => (
          <BoardColumn
            key={status.id}
            status={status}
            tasks={byStatus.get(status.id) ?? []}
            project={project}
            today={today}
          />
        ))}
      </div>
    </div>
  )
}
