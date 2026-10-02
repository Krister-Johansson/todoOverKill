import { useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'

import { ProjectProgress } from '#/components/app/project-progress'
import { RecentActivity } from '#/components/app/recent-activity'
import { TaskCardContent } from '#/components/app/task-card'
import {
  dashboardQueryOptions,
  projectProgressQueryOptions,
  recentActivityQueryOptions,
} from '#/fns/dashboard'
import { toCalendarDay } from '#/lib/dates'

import type { listDashboardTasksFn } from '#/fns/dashboard'

type DashboardTask = Awaited<
  ReturnType<typeof listDashboardTasksFn>
>['dueToday'][number]

const title = 'Dashboard'

// What needs attention across the unarchived projects: tasks due today and
// overdue tasks, then the latest activity and each project's progress.
export const Route = createFileRoute('/_app/')({
  staticData: { title },
  head: () => ({ meta: [{ title: `${title} · todoOverKill` }] }),
  loader: async ({ context }) => {
    // Today picks the tasks and the Overdue word. It travels with the loader
    // data, so the server render and hydration use the same day, as on the
    // board.
    // Now, which the activity's relative times count from, travels the same
    // way.
    const now = new Date()
    const today = toCalendarDay(now)
    // Nothing invalidates the dashboard keys, so cached data is shown at once
    // and refetched in the background whenever it is stale, which with the
    // default staleTime of 0 is every visit: after completing a task, the
    // progress and the activity catch up without a reload.
    const { queryClient } = context
    await Promise.all([
      queryClient.ensureQueryData({
        ...dashboardQueryOptions(today),
        revalidateIfStale: true,
      }),
      queryClient.ensureQueryData({
        ...recentActivityQueryOptions(),
        revalidateIfStale: true,
      }),
      queryClient.ensureQueryData({
        ...projectProgressQueryOptions(),
        revalidateIfStale: true,
      }),
    ])
    return { today, now: now.toISOString() }
  },
  component: Dashboard,
})

function Dashboard() {
  const { today, now } = Route.useLoaderData()
  const { data } = useSuspenseQuery(dashboardQueryOptions(today))
  const { data: activity } = useSuspenseQuery(recentActivityQueryOptions())
  const { data: progress } = useSuspenseQuery(projectProgressQueryOptions())

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <DashboardSection
        id="dashboard-due-today"
        heading="Due today"
        empty="Nothing is due today."
        tasks={data.dueToday}
        today={today}
      />
      <DashboardSection
        id="dashboard-overdue"
        heading="Overdue"
        empty="Nothing is overdue."
        tasks={data.overdue}
        today={today}
      />
      <RecentActivity rows={activity} now={new Date(now)} />
      <ProjectProgress rows={progress} />
    </div>
  )
}

type SectionProps = {
  /** The heading's id, which names the section. */
  id: string
  heading: string
  /** The sentence shown instead of an empty list. */
  empty: string
  tasks: Array<DashboardTask>
  today: string
}

/**
 * A titled list of tasks from any project. Each item is one link to the task
 * page, at least 44 px tall, with the board card's content and the project
 * name.
 */
function DashboardSection({ id, heading, empty, tasks, today }: SectionProps) {
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-3">
      <h2 id={id} className="text-lg font-semibold">
        {heading}
      </h2>
      {tasks.length === 0 ? (
        <p className="text-muted-foreground">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {tasks.map((task) => (
            <li
              key={task.id}
              className="flex min-w-0 rounded-md border border-border bg-card text-card-foreground"
            >
              <Link
                to="/tasks/$taskId"
                params={{ taskId: task.id }}
                className="flex min-h-11 min-w-0 flex-1 flex-col gap-1 rounded-md p-3 hover:bg-accent hover:text-accent-foreground"
              >
                <TaskCardContent
                  task={task}
                  project={task.project}
                  today={today}
                  showProject
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
