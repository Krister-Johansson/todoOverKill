import type { Prisma } from '#/generated/prisma/client'
import { dueDateSchema } from '#/schemas/task'
import { db } from '#/server/db'
import { fromCalendarDate, toCalendarDate } from '#/server/tasks'

/** The status and labels as the tasks service includes them, plus the project. */
const withProject = {
  status: true,
  labels: { select: { label: true }, orderBy: { label: { name: 'asc' } } },
  project: { select: { id: true, name: true, key: true } },
} as const satisfies Prisma.TaskInclude

type DashboardRow = Prisma.TaskGetPayload<{ include: typeof withProject }>

/** The row with the due date as `YYYY-MM-DD` and the labels themselves. */
function flatten(task: DashboardRow) {
  return {
    ...task,
    dueDate: fromCalendarDate(task.dueDate),
    labels: task.labels.map(({ label }) => label),
  }
}

export type DashboardTask = ReturnType<typeof flatten>

/**
 * The tasks of unarchived projects that need attention on `today`, a
 * `YYYY-MM-DD` day: those due that day, and the overdue ones, due before it.
 * Completed tasks are left out of both, the same rule as the board's Overdue
 * word and the overdue filter. One query across projects, ordered by due
 * date, then project name, then task number; each task carries its project.
 * Throws a ZodError when `today` is not a calendar day.
 */
export async function listDashboardTasks(today: string) {
  const day = dueDateSchema.parse(today)
  const tasks = await db.task.findMany({
    where: {
      completedAt: null,
      dueDate: { lte: toCalendarDate(day) },
      project: { is: { archivedAt: null } },
    },
    include: withProject,
    orderBy: [
      { dueDate: 'asc' },
      { project: { name: 'asc' } },
      { number: 'asc' },
    ],
  })
  const dueToday: Array<DashboardTask> = []
  const overdue: Array<DashboardTask> = []
  for (const task of tasks.map(flatten)) {
    if (task.dueDate === day) dueToday.push(task)
    else overdue.push(task)
  }
  return { dueToday, overdue }
}
