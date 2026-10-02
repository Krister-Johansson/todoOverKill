import { Link } from '@tanstack/react-router'
import * as z from 'zod'

import { Pause } from '#/components/app/task-card'
import { describeActivity } from '#/lib/activity'
import { formatDateTime, formatRelativeTime } from '#/lib/dates'

import type { listRecentActivityFn } from '#/fns/dashboard'

type RecentActivityRow = Awaited<
  ReturnType<typeof listRecentActivityFn>
>[number]

// The task number a row's payload holds, for the reference of a deleted task.
const payloadNumberSchema = z.looseObject({ number: z.number().int() })

type RecentActivityProps = {
  /** The rows, newest first, as listRecentActivity returns them. */
  rows: Array<RecentActivityRow>
  /**
   * The moment the relative times count from, from the route loader, so the
   * server render and hydration print the same words.
   */
  now: Date
}

/**
 * The latest activity across unarchived projects, newest first. Each entry
 * reads task reference, project name and sentence, then when it happened as
 * in the task page's Activity section: relative and absolute time in one time
 * element. The reference links to the task; once the task is deleted it is
 * plain text, taken from the payload, or left out when the payload has no
 * number.
 */
export function RecentActivity({ rows, now }: RecentActivityProps) {
  return (
    <section
      aria-labelledby="dashboard-recent-activity"
      className="flex min-w-0 flex-col gap-3"
    >
      <h2 id="dashboard-recent-activity" className="text-lg font-semibold">
        Recent activity
      </h2>
      {rows.length > 0 ? (
        <ol className="flex max-w-prose min-w-0 flex-col gap-4">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex min-w-0 flex-col gap-1 break-words"
            >
              <p className="min-w-0 break-words">
                <Reference row={row} />
                <span className="me-2 text-muted-foreground">
                  {row.project.name}
                </span>
                <Pause />
                {describeActivity(row)}
              </p>
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
        <p className="text-muted-foreground">No activity yet.</p>
      )}
    </section>
  )
}

/**
 * The task reference and a pause after it, spaced from the project name by
 * a margin since the pause is visually hidden: a link to the task while it
 * exists, plain text once it is deleted, nothing without a number.
 */
function Reference({ row }: { row: RecentActivityRow }) {
  if (row.task) {
    return (
      <>
        <Link
          to="/tasks/$taskId"
          params={{ taskId: row.task.id }}
          className="me-2 font-medium underline underline-offset-4"
        >
          {`${row.project.key}-${row.task.number}`}
        </Link>
        <Pause />
      </>
    )
  }
  const payload = payloadNumberSchema.safeParse(row.payload)
  if (!payload.success) return null
  return (
    <>
      <span className="me-2 font-medium">
        {`${row.project.key}-${payload.data.number}`}
      </span>
      <Pause />
    </>
  )
}
