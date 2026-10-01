/**
 * The list view's sort: the `sort` and `dir` search params, their conversion
 * to and from TanStack Table's sorting state, and the comparators behind each
 * column. With no valid sort in the URL the list keeps the server's board
 * order.
 */

import * as z from 'zod'

import type { Priority } from '#/generated/prisma/enums'

/** The sortable columns, in the order the table shows them. */
export const SORT_COLUMNS = [
  'key',
  'title',
  'status',
  'priority',
  'due',
  'updated',
] as const

export type SortColumn = (typeof SORT_COLUMNS)[number]

/**
 * The list route's search params. A value that fails is dropped rather than
 * thrown, so a hand-edited or stale URL shows board order instead of an error.
 */
export const listSearchSchema = z.object({
  sort: z.enum(SORT_COLUMNS).optional().catch(undefined),
  dir: z.enum(['asc', 'desc']).optional().catch(undefined),
})

export type ListSearch = z.infer<typeof listSearchSchema>

/** One column sort, the shape of TanStack Table's sorting state. */
export type ListSorting = Array<{ id: string; desc: boolean }>

/** The table's sorting state for the URL: a sort only when both are valid. */
export function searchToSorting(search: ListSearch): ListSorting {
  if (!search.sort || !search.dir) return []
  return [{ id: search.sort, desc: search.dir === 'desc' }]
}

/**
 * The search params for the table's sorting state. A cleared or unknown sort
 * sets both to undefined, which the router leaves out of the URL.
 */
export function sortingToSearch(sorting: ListSorting): ListSearch {
  const first = sorting.at(0)
  const column = SORT_COLUMNS.find((name) => name === first?.id)
  if (!first || !column) return { sort: undefined, dir: undefined }
  return { sort: column, dir: first.desc ? 'desc' : 'asc' }
}

/** The fields the comparators read. */
export type SortableTask = {
  number: number
  title: string
  priority: Priority
  dueDate: string | null
  updatedAt: Date
  status: { order: number }
}

const PRIORITY_RANK: Record<Priority, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  urgent: 4,
}

/** None ranks lowest, urgent highest, so ascending runs none to urgent. */
export function priorityRank(priority: Priority) {
  return PRIORITY_RANK[priority]
}

const titleCollator = new Intl.Collator('en', {
  numeric: true,
  sensitivity: 'base',
})

function compareNumbers(a: number, b: number) {
  return a - b
}

/**
 * Ascending comparators per column. Due compares `YYYY-MM-DD` strings, which
 * sort as days, and puts a task with no due date last; the table also keeps
 * those last when it sorts descending. The key compares task numbers, so
 * TOK-2 comes before TOK-10.
 */
export const TASK_COMPARATORS: Record<
  SortColumn,
  (a: SortableTask, b: SortableTask) => number
> = {
  key: (a, b) => compareNumbers(a.number, b.number),
  title: (a, b) => titleCollator.compare(a.title, b.title),
  status: (a, b) => compareNumbers(a.status.order, b.status.order),
  priority: (a, b) =>
    compareNumbers(priorityRank(a.priority), priorityRank(b.priority)),
  due: (a, b) => {
    if (a.dueDate === b.dueDate) return 0
    if (a.dueDate === null) return 1
    if (b.dueDate === null) return -1
    return a.dueDate < b.dueDate ? -1 : 1
  },
  updated: (a, b) =>
    compareNumbers(a.updatedAt.getTime(), b.updatedAt.getTime()),
}
