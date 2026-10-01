import { Link } from '@tanstack/react-router'
import { useEffect } from 'react'

import { formatDueDate, isPastDay } from '#/lib/dates'
import { PRIORITY_DISPLAY } from '#/lib/priority'

import { TaskMoveMenu } from './task-move-menu'

import type { listTasksFn } from '#/fns/tasks'
import type { MoveProject } from './task-move-menu'

export type BoardTask = Awaited<ReturnType<typeof listTasksFn>>[number]

type CardTask = Pick<
  BoardTask,
  'number' | 'title' | 'priority' | 'dueDate' | 'completedAt'
> & {
  labels: Array<Pick<BoardTask['labels'][number], 'id' | 'name' | 'color'>>
}

type CardProps = {
  task: CardTask
  project: { name: string; key: string }
  /** Today as YYYY-MM-DD, from the board loader, for the Overdue word. */
  today: string
}

/**
 * A comma only screen readers get. The card is one link, so its parts make one
 * accessible name, and flex layout puts no text between them.
 */
function Pause() {
  return <span className="sr-only">, </span>
}

/**
 * What a card shows, without the link, so it renders outside a router. The
 * priority and the overdue state are words, with colour and an icon as extra
 * cues, and a completed task is never overdue. A label's own colour appears
 * only in its aria-hidden dot: users pick it, so it is not checked for
 * contrast and never colours text or borders.
 */
export function TaskCardContent({ task, project, today }: CardProps) {
  const priority = PRIORITY_DISPLAY[task.priority]
  const PriorityIcon = priority.icon
  const reference = `${project.key}-${task.number}`

  return (
    <>
      <abbr
        title={`${project.name} task ${reference}`}
        className="text-xs font-medium text-muted-foreground no-underline"
      >
        {reference}
      </abbr>
      <Pause />
      <span className="min-w-0 font-medium break-words">{task.title}</span>
      <Pause />
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span
          className={`inline-flex items-center gap-1 ${priority.className}`}
        >
          <PriorityIcon aria-hidden="true" className="size-4 shrink-0" />
          {priority.label}
        </span>
        {task.dueDate ? (
          <>
            <Pause />
            <span>
              Due{' '}
              <time dateTime={task.dueDate}>{formatDueDate(task.dueDate)}</time>
            </span>
          </>
        ) : null}
        {task.dueDate && !task.completedAt && isPastDay(task.dueDate, today) ? (
          <>
            <Pause />
            <span className="font-medium text-destructive">Overdue</span>
          </>
        ) : null}
      </span>
      {task.labels.length > 0 ? (
        <ul className="flex flex-wrap gap-1">
          {task.labels.map((label) => (
            <li
              key={label.id}
              className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-full border border-border px-2 text-xs"
            >
              <Pause />
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: label.color }}
              />
              <span className="min-w-0 break-words">{label.name}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  )
}

/**
 * The id of a task's board card link, so the create task dialog can move
 * focus to a new card.
 */
export function taskCardId(taskId: string) {
  return `task-card-${taskId}`
}

/** The id of a task's Move button, so focus can follow a moved card. */
export function moveButtonId(taskId: string) {
  return `task-move-${taskId}`
}

/**
 * A card control that should take focus when the card renders, and where
 * focus waits. `link` is the card's link (after a create), `move` its Move
 * button (after a move). `release` drops it and its listeners.
 */
type PendingFocus = {
  taskId: string
  target: 'link' | 'move'
  holder: HTMLElement
  release: () => void
}

let pendingFocus: PendingFocus | null = null

/**
 * Records the hand-off. It is dropped when focus lands anywhere but `holder`,
 * so it never pulls focus back from where the user went, and after
 * `expiresIn` ms when that is given.
 */
function waitForCard(
  taskId: string,
  target: PendingFocus['target'],
  holder: HTMLElement,
  expiresIn?: number,
) {
  pendingFocus?.release()
  const onFocusIn = (event: FocusEvent) => {
    if (event.target !== holder) pending.release()
  }
  const timer =
    expiresIn === undefined
      ? undefined
      : window.setTimeout(() => pending.release(), expiresIn)
  const pending: PendingFocus = {
    taskId,
    target,
    holder,
    release: () => {
      if (pendingFocus === pending) pendingFocus = null
      document.removeEventListener('focusin', onFocusIn)
      window.clearTimeout(timer)
    },
  }
  pendingFocus = pending
  document.addEventListener('focusin', onFocusIn)
}

/**
 * Called by a card as it mounts or moves. When a hand-off waits for it and
 * focus is still on the holder, or fell to the page because the holder left
 * the DOM, the card's control takes focus.
 */
function takePendingFocus(taskId: string) {
  const pending = pendingFocus
  if (pending?.taskId !== taskId) return
  const control = document.getElementById(
    pending.target === 'link' ? taskCardId(taskId) : moveButtonId(taskId),
  )
  if (!control) return
  pending.release()
  const active = document.activeElement
  if (active === pending.holder || active === null || active === document.body)
    control.focus()
}

/**
 * Moves focus to a task's card. When the board has not rendered the card yet,
 * focus waits on `holder` and the card takes it as it mounts, so the move does
 * not depend on render timing. If focus leaves `holder` first, or the page has
 * no board, focus stays where it is (2.4.3).
 */
export function focusTaskCard(taskId: string, holder: HTMLElement) {
  const card = document.getElementById(taskCardId(taskId))
  if (card) {
    pendingFocus?.release()
    card.focus()
    return
  }
  holder.focus()
  waitForCard(taskId, 'link', holder)
}

/** How long a moved card's Move button waits to take focus. */
const MOVE_FOCUS_TIMEOUT = 1000

/**
 * Keeps focus on a task's Move button through a move (2.4.3). It focuses the
 * button now if it is on the page, and the same hand-off as focusTaskCard
 * lets the card take focus again once it renders in its new place: in another
 * column, where it mounts afresh, or lower in its own, where React moves it.
 * The wait ends when focus lands elsewhere or after a second, so a late
 * render never takes focus back.
 */
export function focusMoveButton(taskId: string) {
  const button = document.getElementById(moveButtonId(taskId))
  button?.focus()
  waitForCard(taskId, 'move', button ?? document.body, MOVE_FOCUS_TIMEOUT)
}

type BoardCardProps = Omit<CardProps, 'project'> & {
  task: CardTask & { id: string; statusId: string }
  project: MoveProject & { name: string }
  /** The card's place in its column, from 0, and the column's size. */
  position: number
  count: number
}

/**
 * A board card: one link to the task page, at least 44 px tall, and its Move
 * menu beside it, since a button cannot sit inside a link.
 */
export function TaskCard({
  task,
  project,
  today,
  position,
  count,
}: BoardCardProps) {
  useEffect(() => {
    takePendingFocus(task.id)
  }, [task.id, task.statusId, position])

  return (
    <li className="flex min-w-0 items-start gap-1 rounded-md border border-border bg-card text-card-foreground">
      <Link
        id={taskCardId(task.id)}
        to="/tasks/$taskId"
        params={{ taskId: task.id }}
        className="flex min-h-11 min-w-0 flex-1 flex-col gap-1 rounded-md p-3 hover:bg-accent hover:text-accent-foreground"
      >
        <TaskCardContent task={task} project={project} today={today} />
      </Link>
      <TaskMoveMenu
        task={task}
        project={project}
        position={position}
        count={count}
      />
    </li>
  )
}
