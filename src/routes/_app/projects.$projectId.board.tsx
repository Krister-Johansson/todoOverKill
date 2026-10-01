import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'

import { BoardColumn } from '#/components/app/board-column'
import { projectQueryOptions } from '#/fns/projects'
import { tasksQueryOptions } from '#/fns/tasks'
import { toCalendarDay } from '#/lib/dates'

import type { BoardTask } from '#/components/app/task-card'
import type { RefObject } from 'react'

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
          />
        ))}
      </div>
    </div>
  )
}

/**
 * Whether the region is wider inside than out. It watches the region and its
 * content, so a resize, a zoom change, or a different number of columns
 * updates it. The content must size to its children for the last one. False on
 * the server and until the first measurement.
 */
function useOverflowsX(
  regionRef: RefObject<HTMLElement | null>,
  contentRef: RefObject<HTMLElement | null>,
) {
  const [overflows, setOverflows] = useState(false)

  useEffect(() => {
    const region = regionRef.current
    const content = contentRef.current
    if (!region || !content) return
    const measure = () => setOverflows(region.scrollWidth > region.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(region)
    observer.observe(content)
    return () => observer.disconnect()
  }, [regionRef, contentRef])

  return overflows
}
