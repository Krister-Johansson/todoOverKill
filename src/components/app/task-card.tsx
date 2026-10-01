import { Link } from '@tanstack/react-router'

import { formatDueDate, isPastDay } from '#/lib/dates'
import { PRIORITY_DISPLAY } from '#/lib/priority'

import type { listTasksFn } from '#/fns/tasks'

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

/** A board card: one link to the task page, at least 44 px tall. */
export function TaskCard({
  task,
  project,
  today,
}: CardProps & { task: CardTask & { id: string } }) {
  return (
    <li>
      <Link
        id={taskCardId(task.id)}
        to="/tasks/$taskId"
        params={{ taskId: task.id }}
        className="flex min-h-11 min-w-0 flex-col gap-1 rounded-md border border-border bg-card p-3 text-card-foreground hover:bg-accent hover:text-accent-foreground"
      >
        <TaskCardContent task={task} project={project} today={today} />
      </Link>
    </li>
  )
}
