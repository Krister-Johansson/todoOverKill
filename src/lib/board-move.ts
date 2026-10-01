/** Where a move sends a task, with the meaning moveTaskSchema gives it. */
export type MoveTarget = { statusId?: string; index?: number }

type MovableStatus = { id: string; category: string }

type MovableTask<TStatus extends MovableStatus> = {
  id: string
  statusId: string
  completedAt: Date | null
  status: TStatus
}

/**
 * The board's task list after a move, for the optimistic cache write; it
 * mirrors `moveTask` in src/server/tasks.ts. `tasks` must be in board order,
 * as listTasks returns it, so a column is read from list position and never
 * sorted again by `order`. `index` counts the destination column's other
 * tasks and is clamped to the end. Without an index the task goes to the end
 * of another status and stays put in its own. Entering a done-category status
 * sets `completedAt` (kept if already set), leaving one clears it, and a
 * reorder within one status keeps it. Columns follow `statuses`, with tasks of
 * a status not in it last. A move that leaves the task where it is, or to a
 * status not in `statuses`, returns `tasks` itself.
 */
export function moveTaskInList<
  TStatus extends MovableStatus,
  TTask extends MovableTask<TStatus>,
>(
  tasks: Array<TTask>,
  taskId: string,
  target: MoveTarget,
  statuses: Array<TStatus>,
): Array<TTask> {
  const task = tasks.find((candidate) => candidate.id === taskId)
  if (!task) return tasks
  const to = statuses.find(
    (status) => status.id === (target.statusId ?? task.statusId),
  )
  if (!to) return tasks
  const sameStatus = to.id === task.statusId
  const others = tasks.filter(
    (other) => other.statusId === to.id && other.id !== taskId,
  )
  const end = others.length
  let at = target.index === undefined ? end : Math.min(target.index, end)
  if (sameStatus) {
    const current = tasks
      .filter((other) => other.statusId === to.id)
      .indexOf(task)
    if (target.index === undefined) at = current
    if (at === current) return tasks
  }
  const completedAt =
    to.category === 'done'
      ? (task.completedAt ?? new Date())
      : sameStatus
        ? task.completedAt
        : null
  const moved = { ...task, statusId: to.id, status: to, completedAt } as TTask
  const column = [...others.slice(0, at), moved, ...others.slice(at)]

  const known = new Set(statuses.map((status) => status.id))
  const rest = (keep: (other: TTask) => boolean) =>
    tasks.filter((other) => other.id !== taskId && keep(other))
  return [
    ...statuses.flatMap((status) =>
      status.id === to.id
        ? column
        : rest((other) => other.statusId === status.id),
    ),
    ...rest((other) => !known.has(other.statusId)),
  ]
}

/** The move input for one step up from `position` in the task's column. */
export function moveUpInput(position: number): MoveTarget {
  return { index: position - 1 }
}

/**
 * The move input for one step down. The index counts the column's other
 * tasks, so the place after the next task is `position + 1`.
 */
export function moveDownInput(position: number): MoveTarget {
  return { index: position + 1 }
}
