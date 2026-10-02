import { useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'

import { TaskCardContent } from '#/components/app/task-card'
import { dashboardQueryOptions } from '#/fns/dashboard'
import { toCalendarDay } from '#/lib/dates'

import type { listDashboardTasksFn } from '#/fns/dashboard'

type DashboardTask = Awaited<
  ReturnType<typeof listDashboardTasksFn>
>['dueToday'][number]

const title = 'Dashboard'

// What needs attention across the unarchived projects: tasks due today and
// overdue tasks. Recent activity and project progress come with F64 (#92).
export const Route = createFileRoute('/_app/')({
  staticData: { title },
  head: () => ({ meta: [{ title: `${title} · todoOverKill` }] }),
  loader: async ({ context }) => {
    // Today picks the tasks and the Overdue word. It travels with the loader
    // data, so the server render and hydration use the same day, as on the
    // board.
    const today = toCalendarDay(new Date())
    await context.queryClient.ensureQueryData(dashboardQueryOptions(today))
    return { today }
  },
  component: Dashboard,
})

function Dashboard() {
  const { today } = Route.useLoaderData()
  const { data } = useSuspenseQuery(dashboardQueryOptions(today))

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
