import {
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import { Link } from '@tanstack/react-router'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'

import { Button } from '#/components/ui/button'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { useOverflowsX } from '#/hooks/use-overflows-x'
import { formatDateTime, formatDueDate, isPastDay } from '#/lib/dates'
import { PRIORITY_DISPLAY } from '#/lib/priority'
import { TASK_COMPARATORS } from '#/lib/task-sort'

import type { BoardTask } from '#/components/app/task-card'
import type { ListSorting, SortColumn } from '#/lib/task-sort'

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
})

const helper = createColumnHelper<typeof features, BoardTask>()

/** The column's comparator from task-sort, on the rows' tasks. */
function sortBy(column: SortColumn) {
  return (
    rowA: { original: BoardTask },
    rowB: { original: BoardTask },
  ): number => TASK_COMPARATORS[column](rowA.original, rowB.original)
}

type TaskTableProps = {
  project: { name: string; key: string }
  /** The tasks in board order, the order shown while nothing is sorted. */
  tasks: Array<BoardTask>
  /** Today as YYYY-MM-DD, from the route loader, for the Overdue word. */
  today: string
  sorting: ListSorting
  onSortingChange: (sorting: ListSorting) => void
}

/**
 * The list view's table: one row per task, sortable by each column's header
 * button. The sort is controlled, so the route can keep it in the URL. Each
 * row is one link, in the title cell, stretched over the row, so a click
 * anywhere in the row opens the task and the keyboard meets one Tab stop per
 * row.
 */
export function TaskTable({
  project,
  tasks,
  today,
  sorting,
  onSortingChange,
}: TaskTableProps) {
  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor('number', {
          id: 'key',
          header: 'Key',
          sortFn: sortBy('key'),
          cell: ({ row }) => {
            const reference = `${project.key}-${row.original.number}`
            // Above the row link's overlay, so a pointer can hover the abbr
            // and see its expansion (3.1.4). The other cells stay row link.
            return (
              <abbr
                title={`${project.name} task ${reference}`}
                className="relative z-10 font-medium whitespace-nowrap text-muted-foreground no-underline"
              >
                {reference}
              </abbr>
            )
          },
        }),
        helper.accessor('title', {
          id: 'title',
          header: 'Title',
          sortFn: sortBy('title'),
          // The ::after covers the row, which is relative, so the whole row
          // is the link's click target. Only the title is its name.
          cell: ({ row }) => (
            <Link
              to="/tasks/$taskId"
              params={{ taskId: row.original.id }}
              className="font-medium break-words underline-offset-4 after:absolute after:inset-0 after:content-[''] hover:underline"
            >
              {row.original.title}
            </Link>
          ),
        }),
        helper.accessor((task) => task.status.order, {
          id: 'status',
          header: 'Status',
          sortFn: sortBy('status'),
          cell: ({ row }) => (
            <span className="break-words">{row.original.status.name}</span>
          ),
        }),
        helper.accessor('priority', {
          id: 'priority',
          header: 'Priority',
          sortFn: sortBy('priority'),
          cell: ({ row }) => {
            const priority = PRIORITY_DISPLAY[row.original.priority]
            const PriorityIcon = priority.icon
            return (
              <span
                className={`inline-flex items-center gap-1 ${priority.className}`}
              >
                <PriorityIcon aria-hidden="true" className="size-4 shrink-0" />
                {priority.label}
              </span>
            )
          },
        }),
        // Undefined, not null, for no due date, so sortUndefined keeps those
        // tasks last in both directions.
        helper.accessor((task) => task.dueDate ?? undefined, {
          id: 'due',
          header: 'Due',
          sortFn: sortBy('due'),
          sortUndefined: 'last',
          cell: ({ row }) => {
            const { dueDate, completedAt } = row.original
            if (!dueDate) return <span className="sr-only">No due date</span>
            return (
              <span className="flex flex-col">
                <time dateTime={dueDate}>{formatDueDate(dueDate)}</time>
                {!completedAt && isPastDay(dueDate, today) ? (
                  <span className="font-medium text-destructive">Overdue</span>
                ) : null}
              </span>
            )
          },
        }),
        helper.accessor((task) => task.updatedAt.getTime(), {
          id: 'updated',
          header: 'Updated',
          sortFn: sortBy('updated'),
          cell: ({ row }) => (
            <time dateTime={row.original.updatedAt.toISOString()}>
              {formatDateTime(row.original.updatedAt)}
            </time>
          ),
        }),
      ]),
    [project.key, project.name, today],
  )

  const table = useTable({
    features,
    columns,
    data: tasks,
    state: { sorting },
    onSortingChange: (updater) =>
      onSortingChange(
        typeof updater === 'function' ? updater(sorting) : updater,
      ),
    enableMultiSort: false,
    sortDescFirst: false,
    enableSortingRemoval: true,
  })

  const regionRef = useRef<HTMLDivElement>(null)
  const tableRef = useRef<HTMLTableElement>(null)
  const scrollable = useOverflowsX(regionRef, tableRef)
  // As on the board: the region stays a Tab stop while it holds focus, so
  // focus does not fall to the body if a resize ends the overflow.
  const [regionFocused, setRegionFocused] = useState(false)

  // A data table keeps its columns at 320 px (1.4.10 exempts content that
  // needs two dimensions). Cells wrap first; a table still too wide scrolls
  // inside the container, never the page, and the container then takes focus
  // so the keyboard can scroll it. The container is relative (from Table),
  // so the rows' stretched links stay inside it.
  return (
    <Table
      ref={tableRef}
      containerProps={{
        ref: regionRef,
        role: 'region',
        'aria-label': 'Task table',
        tabIndex: scrollable || regionFocused ? 0 : undefined,
        onFocus: (event) => {
          if (event.target === event.currentTarget) setRegionFocused(true)
        },
        onBlur: (event) => {
          if (event.target === event.currentTarget) setRegionFocused(false)
        },
        className: 'p-1',
      }}
    >
      <TableCaption>
        {project.name}:{' '}
        {tasks.length === 1 ? '1 task' : `${tasks.length} tasks`}
      </TableCaption>
      <TableHeader>
        {table.getHeaderGroups().map((group) => (
          <TableRow key={group.id}>
            {group.headers.map((header) => {
              const sorted = header.column.getIsSorted()
              const SortIcon =
                sorted === 'asc'
                  ? ArrowUp
                  : sorted === 'desc'
                    ? ArrowDown
                    : ArrowUpDown
              return (
                <TableHead
                  key={header.id}
                  scope="col"
                  aria-sort={
                    sorted === 'asc'
                      ? 'ascending'
                      : sorted === 'desc'
                        ? 'descending'
                        : undefined
                  }
                >
                  <Button
                    type="button"
                    variant="ghost"
                    className="px-2 has-[>svg]:px-2"
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <table.FlexRender header={header} />
                    <SortIcon aria-hidden="true" />
                  </Button>
                </TableHead>
              )
            })}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow
            key={row.id}
            className="relative h-11 hover:bg-accent hover:text-accent-foreground has-[a:focus-visible]:bg-accent has-[a:focus-visible]:text-accent-foreground"
          >
            {row.getAllCells().map((cell) => (
              <TableCell key={cell.id}>
                <table.FlexRender cell={cell} />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
