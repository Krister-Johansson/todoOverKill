import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useMemo } from 'react'

import { useAnnounce } from '#/components/app/live-region'
import { TaskFilterBar } from '#/components/app/task-filter-bar'
import { TaskTable } from '#/components/app/task-table'
import { labelsQueryOptions } from '#/fns/labels'
import { projectQueryOptions } from '#/fns/projects'
import { tasksQueryOptions } from '#/fns/tasks'
import { toCalendarDay } from '#/lib/dates'
import {
  clearedFilters,
  filterAnnouncement,
  filterTasks,
  hasActiveFilters,
  pickFilters,
  resolveFilters,
  taskFilterSearchSchema,
} from '#/lib/task-filter'
import {
  listSearchSchema,
  searchToSorting,
  sortingToSearch,
} from '#/lib/task-sort'

import type { TaskFilters } from '#/lib/task-filter'
import type { ListSorting, SortColumn } from '#/lib/task-sort'

const COLUMN_NAMES: Record<SortColumn, string> = {
  key: 'Key',
  title: 'Title',
  status: 'Status',
  priority: 'Priority',
  due: 'Due',
  updated: 'Updated',
}

// The list view: the board's tasks in a sortable table. The sort lives in the
// URL (`sort` and `dir`), so a reload keeps it; an invalid value means board
// order. The board's filters sit beside it. Sorting and filtering happen in
// the browser, so, as on the board, the loader leaves the search out of its
// deps and runs only when the list is entered. Like the board it sets no
// head, so the tab keeps the project title.
export const Route = createFileRoute('/_app/projects/$projectId/list')({
  staticData: { title: 'List' },
  validateSearch: listSearchSchema.extend(taskFilterSearchSchema.shape),
  loaderDeps: () => ({}),
  shouldReload: ({ cause }) => cause === 'enter',
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(tasksQueryOptions(params.projectId)),
      context.queryClient.ensureQueryData(labelsQueryOptions(params.projectId)),
    ])
    // Today for the Overdue word, as on the board.
    return { today: toCalendarDay(new Date()) }
  },
  component: ListPage,
})

/** What the live region says after a sort change. */
function sortAnnouncement(sorting: ListSorting) {
  const { sort, dir } = sortingToSearch(sorting)
  if (!sort) return 'Sorting cleared'
  return `Sorted by ${COLUMN_NAMES[sort]}, ${dir === 'desc' ? 'descending' : 'ascending'}`
}

function ListPage() {
  const { projectId } = Route.useParams()
  const { today } = Route.useLoaderData()
  const search = Route.useSearch()
  const { sort, dir } = search
  const navigate = Route.useNavigate()
  const announce = useAnnounce()
  const { data: project } = useSuspenseQuery(projectQueryOptions(projectId))
  const { data: tasks } = useSuspenseQuery(tasksQueryOptions(projectId))
  const { data: labels } = useSuspenseQuery(labelsQueryOptions(projectId))

  const sorting = useMemo(() => searchToSorting({ sort, dir }), [sort, dir])
  const filters = useMemo(
    () => resolveFilters(search, project.statuses, labels),
    [search, project.statuses, labels],
  )
  const shown = useMemo(
    () => filterTasks(tasks, filters, today),
    [tasks, filters, today],
  )

  // Like a sort change: replace, keep the scroll position and the sort.
  function applyFilters(next: TaskFilters) {
    void navigate({
      search: (previous) => ({ ...previous, ...next }),
      replace: true,
      resetScroll: false,
    })
    announce(
      filterAnnouncement(filterTasks(tasks, next, today).length, tasks.length),
    )
  }

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

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* Keyed, so text typed but not applied stays with its project. */}
      <TaskFilterBar
        key={projectId}
        filters={filters}
        active={hasActiveFilters(pickFilters(search))}
        statuses={project.statuses}
        labels={labels}
        shown={shown.length}
        total={tasks.length}
        onChange={applyFilters}
        onClear={() => applyFilters(clearedFilters())}
      />
      {tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tasks</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No tasks match the filters
        </p>
      ) : (
        <TaskTable
          project={project}
          tasks={shown}
          today={today}
          sorting={sorting}
          onSortingChange={changeSorting}
        />
      )}
    </div>
  )
}
