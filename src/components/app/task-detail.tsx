import { Link } from '@tanstack/react-router'
import { useId } from 'react'

import { formatDateTime, formatDueDate, isPastDay } from '#/lib/dates'
import { PRIORITY_DISPLAY } from '#/lib/priority'

import { LabelChip } from './label-chip'
import { Markdown } from './markdown'

import type { ReactNode } from 'react'
import type { getTaskFn } from '#/fns/tasks'

type FullTask = Awaited<ReturnType<typeof getTaskFn>>

export type DetailTask = Pick<
  FullTask,
  | 'number'
  | 'title'
  | 'description'
  | 'priority'
  | 'dueDate'
  | 'completedAt'
  | 'createdAt'
  | 'updatedAt'
> & {
  status: Pick<FullTask['status'], 'name'>
  labels: Array<Pick<FullTask['labels'][number], 'id' | 'name' | 'color'>>
}

type TaskDetailProps = {
  task: DetailTask
  project: { id: string; name: string; key: string }
  /** Today as YYYY-MM-DD, from the route loader, for the Overdue word. */
  today: string
  /** The level of the Description heading. Markdown headings sit below it. */
  headingLevel?: 2 | 3
}

function Field({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 sm:contents">
      <dt className="font-medium text-muted-foreground">{term}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  )
}

function Moment({ value }: { value: Date }) {
  return <time dateTime={value.toISOString()}>{formatDateTime(value)}</time>
}

/**
 * Every field of a task, read only, and its description as Markdown. The
 * priority and the overdue state are words, with colour and an icon as extra
 * cues, and a completed task is never overdue. Labels render as LabelChip,
 * as on the board card.
 */
export function TaskDetail({
  task,
  project,
  today,
  headingLevel = 2,
}: TaskDetailProps) {
  const priority = PRIORITY_DISPLAY[task.priority]
  const PriorityIcon = priority.icon
  const reference = `${project.key}-${task.number}`
  const DescriptionHeading = `h${headingLevel}` as const
  const descriptionHeadingId = useId()

  return (
    <div className="flex min-w-0 flex-col gap-6 break-words">
      <dl className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-[max-content_minmax(0,1fr)] sm:gap-x-6">
        <Field term="Reference">
          <abbr
            title={`${project.name} task ${reference}`}
            className="no-underline"
          >
            {reference}
          </abbr>
        </Field>
        <Field term="Project">
          <Link
            to="/projects/$projectId/board"
            params={{ projectId: project.id }}
            className="inline-flex min-h-11 items-center underline underline-offset-4"
          >
            {project.name}
          </Link>
        </Field>
        <Field term="Status">{task.status.name}</Field>
        <Field term="Priority">
          <span
            className={`inline-flex items-center gap-1 ${priority.className}`}
          >
            <PriorityIcon aria-hidden="true" className="size-4 shrink-0" />
            {priority.label}
          </span>
        </Field>
        <Field term="Due date">
          {task.dueDate ? (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <time dateTime={task.dueDate}>{formatDueDate(task.dueDate)}</time>
              {!task.completedAt && isPastDay(task.dueDate, today) ? (
                <span className="font-medium text-destructive">Overdue</span>
              ) : null}
            </span>
          ) : (
            <span className="text-muted-foreground">No due date</span>
          )}
        </Field>
        <Field term="Labels">
          {task.labels.length > 0 ? (
            <ul className="flex flex-wrap gap-1">
              {task.labels.map((label) => (
                <li key={label.id} className="max-w-full min-w-0">
                  <LabelChip
                    label={label}
                    className="text-sm leading-relaxed"
                  />
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-muted-foreground">No labels</span>
          )}
        </Field>
        <Field term="Created">
          <Moment value={task.createdAt} />
        </Field>
        <Field term="Updated">
          <Moment value={task.updatedAt} />
        </Field>
        {task.completedAt ? (
          <Field term="Completed">
            <Moment value={task.completedAt} />
          </Field>
        ) : null}
      </dl>
      <section
        aria-labelledby={descriptionHeadingId}
        className="flex min-w-0 flex-col gap-3"
      >
        <DescriptionHeading
          id={descriptionHeadingId}
          className="text-lg font-semibold"
        >
          Description
        </DescriptionHeading>
        {task.description ? (
          <Markdown headingLevel={headingLevel}>{task.description}</Markdown>
        ) : (
          <p className="text-muted-foreground">No description</p>
        )}
      </section>
    </div>
  )
}
