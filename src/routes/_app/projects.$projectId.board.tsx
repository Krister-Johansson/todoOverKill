import { useIsMutating, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'

import { BoardColumn } from '#/components/app/board-column'
import { useAnnounce } from '#/components/app/live-region'
import { TaskFilterBar } from '#/components/app/task-filter-bar'
import { labelsQueryOptions } from '#/fns/labels'
import { projectQueryOptions } from '#/fns/projects'
import { tasksQueryOptions } from '#/fns/tasks'
import { useOverflowsX } from '#/hooks/use-overflows-x'
import { toCalendarDay } from '#/lib/dates'
import {
  clearedFilters,
  filterAnnouncement,
  filterTasks,
  hasActiveFilters,
  matchesFilters,
  pickFilters,
  resolveFilters,
  sameFilters,
  taskFilterSearchSchema,
} from '#/lib/task-filter'

import type { BoardTask } from '#/components/app/task-card'
import type { TaskFilters } from '#/lib/task-filter'

// The board. It sets no head, so the tab keeps the layout's project
// title. The filters live in the URL and apply in the browser to the cached
// tasks, so the loader leaves the search out of its deps and runs only when
// the board is entered: a filter change fetches nothing.
export const Route = createFileRoute('/_app/projects/$projectId/board')({
  staticData: { title: 'Board' },
  validateSearch: taskFilterSearchSchema,
  loaderDeps: () => ({}),
  shouldReload: ({ cause }) => cause === 'enter',
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(tasksQueryOptions(params.projectId)),
      context.queryClient.ensureQueryData(labelsQueryOptions(params.projectId)),
    ])
    // Today for the Overdue word and the due filters. It travels with the
    // loader data, so the server render and hydration use the same day.
    return { today: toCalendarDay(new Date()) }
  },
  component: BoardPage,
})

/**
 * How long the board waits, once no change is in flight, before it says the
 * new count, so the change's own message (such as "Moved KEY-1 to Done") is
 * spoken first rather than replaced.
 */
const COUNT_ANNOUNCE_DELAY = 1000

function BoardPage() {
  const { projectId } = Route.useParams()
  const { today } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const announce = useAnnounce()
  const { data: project } = useSuspenseQuery(projectQueryOptions(projectId))
  const { data: tasks } = useSuspenseQuery(tasksQueryOptions(projectId))
  const { data: labels } = useSuspenseQuery(labelsQueryOptions(projectId))

  const filters = useMemo(
    () => resolveFilters(search, project.statuses, labels),
    [search, project.statuses, labels],
  )
  const shown = useMemo(
    () => filterTasks(tasks, filters, today).length,
    [tasks, filters, today],
  )

  // A change that is not a filter change, such as a move to a status the
  // filter hides, can take a card out of view. Its Move button leaves with
  // it, so focus that fell to the page goes to the results line (2.4.3), and
  // the new count is said once nothing is in flight. A failed move puts the
  // card back, and then the count is not said.
  const resultsRef = useRef<HTMLParagraphElement>(null)
  const last = useRef({ filters, shown })
  const shownBefore = useRef<number | null>(null)
  const mutating = useIsMutating()
  useEffect(() => {
    const previous = last.current
    last.current = { filters, shown }
    if (!sameFilters(previous.filters, filters)) {
      shownBefore.current = null
      return
    }
    if (shown >= previous.shown) return
    shownBefore.current ??= previous.shown
    const active = document.activeElement
    if (active === null || active === document.body) {
      resultsRef.current?.focus()
    }
  }, [filters, shown])
  useEffect(() => {
    if (shownBefore.current === null || mutating > 0) return
    const timer = window.setTimeout(() => {
      // A filter change since then said its own count and reset this.
      if (shownBefore.current !== null && shownBefore.current !== shown) {
        announce(filterAnnouncement(shown, tasks.length))
      }
      shownBefore.current = null
    }, COUNT_ANNOUNCE_DELAY)
    return () => window.clearTimeout(timer)
  }, [mutating, shown, tasks.length, announce])

  // Replace, so Back leaves the board instead of stepping through filters.
  // The page keeps its scroll position, and focus stays on the control.
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

  // Every card's column is the whole column; the filter only hides cards.
  const byStatus = useMemo(() => {
    const map = new Map<string, Array<BoardTask>>()
    for (const task of tasks) {
      const column = map.get(task.statusId)
      if (column) column.push(task)
      else map.set(task.statusId, [task])
    }
    return map
  }, [tasks])

  const regionRef = useRef<HTMLDivElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)
  const scrollable = useOverflowsX(regionRef, rowRef)
  // Keeps the region a Tab stop while it holds focus, so focus does not fall
  // to the body if it stops overflowing then (a zoom or resize).
  const [regionFocused, setRegionFocused] = useState(false)

  // From md the columns sit in a row that scrolls inside this region, never
  // the page. The region takes focus only while it overflows, so keyboard
  // users can scroll it then and meet no extra Tab stop otherwise. From md the
  // row is as wide as its columns (w-max), so a change in the number of
  // columns resizes it and the observer measures again. The region is
  // relative so it contains the cards' sr-only separators, which are
  // absolutely positioned; without it, cards scrolled out of view to the right
  // widen the page. The region clips what it paints outside its box, so the
  // row's 4 px padding leaves room for the cards' focus outline (2 px with a
  // 2 px offset) on every side.
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <TaskFilterBar
        filters={filters}
        active={hasActiveFilters(pickFilters(search))}
        statuses={project.statuses}
        labels={labels}
        shown={shown}
        total={tasks.length}
        onChange={applyFilters}
        onClear={() => applyFilters(clearedFilters())}
        resultsRef={resultsRef}
      />
      <div
        ref={regionRef}
        role="region"
        aria-label="Board columns"
        tabIndex={scrollable || regionFocused ? 0 : undefined}
        onFocus={(event) => {
          if (event.target === event.currentTarget) setRegionFocused(true)
        }}
        onBlur={(event) => {
          if (event.target === event.currentTarget) setRegionFocused(false)
        }}
        className="relative min-w-0 md:overflow-x-auto md:pb-2"
      >
        <div
          ref={rowRef}
          className="flex flex-col gap-4 md:w-max md:flex-row md:items-start md:p-1"
        >
          {/* getProject returns the statuses sorted by Status.order. */}
          {project.statuses.map((status) => (
            <BoardColumn
              key={status.id}
              status={status}
              tasks={byStatus.get(status.id) ?? []}
              project={project}
              today={today}
              shows={(task) => matchesFilters(task, filters, today)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
