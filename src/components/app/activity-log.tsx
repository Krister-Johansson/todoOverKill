import { useId } from 'react'

import { describeActivity } from '#/lib/activity'
import { formatDateTime, formatRelativeTime } from '#/lib/dates'

import type { ActivityRow } from '#/schemas/activity'

type ActivityLogProps = {
  /** The task's rows, oldest first, as listTaskActivity returns them. */
  rows: Array<Pick<ActivityRow, 'id' | 'type' | 'payload' | 'createdAt'>>
  /**
   * The moment the relative times count from, from the route loader, so the
   * server render and hydration print the same words.
   */
  now: Date
  headingLevel?: 2 | 3
}

/**
 * A task's history as sentences, oldest first. Each entry shows when it
 * happened twice, as visible text: relative ("2 hours ago") and absolute in
 * the local zone, inside one time element whose datetime is the ISO moment.
 * Sentences quote user text, so they break inside long words rather than
 * widening the page.
 */
export function ActivityLog({ rows, now, headingLevel = 2 }: ActivityLogProps) {
  const Heading = `h${headingLevel}` as const
  const headingId = useId()

  return (
    <section
      aria-labelledby={headingId}
      className="flex min-w-0 flex-col gap-3"
    >
      <Heading id={headingId} className="text-lg font-semibold">
        Activity
      </Heading>
      {rows.length > 0 ? (
        <ol className="flex min-w-0 flex-col gap-4">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex min-w-0 flex-col gap-1 break-words"
            >
              <p className="min-w-0 break-words">{describeActivity(row)}</p>
              <time
                dateTime={row.createdAt.toISOString()}
                className="text-sm text-muted-foreground"
              >
                {`${formatRelativeTime(row.createdAt, now)} (${formatDateTime(row.createdAt)})`}
              </time>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-muted-foreground">No activity yet</p>
      )}
    </section>
  )
}
