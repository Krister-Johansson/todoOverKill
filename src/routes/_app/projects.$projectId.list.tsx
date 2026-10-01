import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useMemo } from 'react'

import { useAnnounce } from '#/components/app/live-region'
import { TaskTable } from '#/components/app/task-table'
import { projectQueryOptions } from '#/fns/projects'
import { tasksQueryOptions } from '#/fns/tasks'
import { toCalendarDay } from '#/lib/dates'
import {
  listSearchSchema,
  searchToSorting,
  sortingToSearch,
} from '#/lib/task-sort'

import type { ListSorting } from '#/lib/task-sort'

const COLUMN_NAMES: Record<string, string> = {
  key: 'Key',
  title: 'Title',
  status: 'Status',
  priority: 'Priority',
  due: 'Due',
  updated: 'Updated',
}

// The list view: the board's tasks in a sortable table. The sort lives in the
// URL (`sort` and `dir`), so a reload keeps it; an invalid value means board
// order. Like the board it sets no head, so the tab keeps the project title.
export const Route = createFileRoute('/_app/projects/$projectId/list')({
  staticData: { title: 'List' },
  validateSearch: listSearchSchema,
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(
      tasksQueryOptions(params.projectId),
    )
    // Today for the Overdue word, as on the board.
    return { today: toCalendarDay(new Date()) }
  },
  component: ListPage,
})

/** What the live region says after a sort change. */
function sortAnnouncement(sorting: ListSorting) {
  const first = sorting.at(0)
  if (!first) return 'Sorting cleared'
  const name = COLUMN_NAMES[first.id] ?? first.id
  return `Sorted by ${name}, ${first.desc ? 'descending' : 'ascending'}`
}

function ListPage() {
  const { projectId } = Route.useParams()
  const { today } = Route.useLoaderData()
  const { sort, dir } = Route.useSearch()
  const navigate = Route.useNavigate()
  const announce = useAnnounce()
  const { data: project } = useSuspenseQuery(projectQueryOptions(projectId))
  const { data: tasks } = useSuspenseQuery(tasksQueryOptions(projectId))

  const sorting = useMemo(() => searchToSorting({ sort, dir }), [sort, dir])

  function changeSorting(next: ListSorting) {
    // Replace, so Back leaves the list instead of stepping through sorts. The
    // page keeps its scroll position, and focus stays on the header button.
    void navigate({
      search: (previous) => ({ ...previous, ...sortingToSearch(next) }),
      replace: true,
      resetScroll: false,
    })
    announce(sortAnnouncement(next))
  }

  if (tasks.length === 0) {
    return <p className="text-sm text-muted-foreground">No tasks</p>
  }

  return (
    <TaskTable
      project={project}
      tasks={tasks}
      today={today}
      sorting={sorting}
      onSortingChange={changeSorting}
    />
  )
}
