/**
 * The board and list filters: the `status`, `priority`, `label`, `due` and
 * `q` search params (the names the REST list takes), and the matcher that
 * applies them to the cached tasks in the browser. The rules are the
 * listTasks service's, so a filter in the URL and the same filter on the REST
 * list pick the same tasks.
 */

import * as z from 'zod'

import { dueFilterRange } from '#/lib/dates'
import {
  dueFilterSchema,
  searchTextSchema,
  taskPrioritySchema,
} from '#/schemas/task'
import { statusIdSchema } from '#/schemas/status'

import type { Priority } from '#/generated/prisma/enums'

/**
 * The filter search params. A value that fails is dropped rather than
 * thrown, so a hand-edited or stale URL shows every task instead of an error.
 * An empty value fails too, and blank text means no text filter.
 */
export const taskFilterSearchSchema = z.object({
  status: statusIdSchema.optional().catch(undefined),
  priority: taskPrioritySchema.optional().catch(undefined),
  label: z.string().min(1).optional().catch(undefined),
  due: dueFilterSchema.optional().catch(undefined),
  q: searchTextSchema.catch(undefined),
})

export type TaskFilters = z.infer<typeof taskFilterSearchSchema>

/** The filter keys, in the order the bar shows them. */
export const FILTER_KEYS = ['status', 'priority', 'label', 'due', 'q'] as const

/**
 * Only the filter keys of a search object, so a link to the board does not
 * carry the list's sort.
 */
export function pickFilters(search: Partial<TaskFilters>): TaskFilters {
  return {
    status: search.status,
    priority: search.priority,
    label: search.label,
    due: search.due,
    q: search.q,
  }
}

/**
 * The filters with a status or label the project does not have dropped, so a
 * stale id shows every task and the bar shows "Any".
 */
export function resolveFilters(
  filters: TaskFilters,
  statuses: ReadonlyArray<{ id: string }>,
  labels: ReadonlyArray<{ id: string }>,
): TaskFilters {
  const picked = pickFilters(filters)
  return {
    ...picked,
    status: statuses.some((s) => s.id === picked.status)
      ? picked.status
      : undefined,
    label: labels.some((l) => l.id === picked.label) ? picked.label : undefined,
  }
}

export function hasActiveFilters(filters: TaskFilters) {
  return FILTER_KEYS.some((key) => filters[key] !== undefined)
}

/** Every filter key set to undefined, which the router leaves out of the URL. */
export function clearedFilters(): TaskFilters {
  return {
    status: undefined,
    priority: undefined,
    label: undefined,
    due: undefined,
    q: undefined,
  }
}

/** The fields the matcher reads. */
export type FilterableTask = {
  statusId: string
  priority: Priority
  labels: ReadonlyArray<{ id: string }>
  dueDate: string | null
  completedAt: Date | null
  title: string
  description: string | null
}

/**
 * Whether `task` passes every filter that is set. `today` is the loader's
 * calendar day, so the server render and hydration agree on the due presets.
 */
export function matchesFilters(
  task: FilterableTask,
  filters: TaskFilters,
  today: string,
) {
  const { status, priority, label, due, q } = filters
  if (status && task.statusId !== status) return false
  if (priority && task.priority !== priority) return false
  if (label && !task.labels.some((l) => l.id === label)) return false
  if (due) {
    const { dueFrom, dueTo, completed } = dueFilterRange(due, today)
    if (task.dueDate === null) return false
    if (dueFrom && task.dueDate < dueFrom) return false
    if (dueTo && task.dueDate > dueTo) return false
    if (completed === false && task.completedAt !== null) return false
  }
  if (q) {
    const text = q.toLowerCase()
    const inTitle = task.title.toLowerCase().includes(text)
    const inDescription = (task.description ?? '').toLowerCase().includes(text)
    if (!inTitle && !inDescription) return false
  }
  return true
}

/** The tasks that pass every filter, in their original order. */
export function filterTasks<T extends FilterableTask>(
  tasks: ReadonlyArray<T>,
  filters: TaskFilters,
  today: string,
): Array<T> {
  return tasks.filter((task) => matchesFilters(task, filters, today))
}

function taskCount(count: number) {
  return count === 1 ? '1 task' : `${count} tasks`
}

/** What the bar shows and the live region says after a filter change. */
export function filterAnnouncement(shown: number, total: number) {
  if (total === 0) return 'No tasks'
  if (shown === total) return `Showing all ${taskCount(total)}`
  return `Showing ${shown} of ${taskCount(total)}`
}
