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
 * date, then project name, then project key, then task number, so the order
 * is the same on every read; each task carries its project.
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
      { project: { key: 'asc' } },
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

/** How many activity rows the dashboard shows. */
export const RECENT_ACTIVITY_LIMIT = 20

/**
 * The latest `limit` activity rows of unarchived projects, newest first, each
 * with its project (`id`, `name`, `key`) and its task (`id`, `number`), or
 * `task: null` once the task is deleted. One `findMany` whatever the number of
 * projects: Prisma loads the project and task of every row in one statement
 * per table, never one per row. Rows written in the same millisecond come in
 * id order, so the order is the same on every read.
 */
export async function listRecentActivity(limit = RECENT_ACTIVITY_LIMIT) {
  return db.activity.findMany({
    where: { project: { is: { archivedAt: null } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit,
    select: {
      id: true,
      type: true,
      payload: true,
      createdAt: true,
      project: { select: { id: true, name: true, key: true } },
      task: { select: { id: true, number: true } },
    },
  })
}

export type RecentActivityRow = Awaited<
  ReturnType<typeof listRecentActivity>
>[number]

/**
 * Every unarchived project with its number of tasks (`total`) and of completed
 * ones (`done`), ordered by name, then key. Done means `completedAt` is set,
 * the rule the Overdue word uses, so a task created in a Done status counts.
 * Two operations whatever the number of projects, run together and joined in
 * memory: the projects with their task count, and the completed tasks grouped
 * by project.
 */
export async function listProjectProgress() {
  const [projects, completed] = await Promise.all([
    db.project.findMany({
      where: { archivedAt: null },
      orderBy: [{ name: 'asc' }, { key: 'asc' }],
      select: {
        id: true,
        name: true,
        key: true,
        _count: { select: { tasks: true } },
      },
    }),
    db.task.groupBy({
      by: ['projectId'],
      where: {
        completedAt: { not: null },
        project: { is: { archivedAt: null } },
      },
      _count: { _all: true },
    }),
  ])
  const done = new Map(
    completed.map((group) => [group.projectId, group._count._all]),
  )
  return projects.map(({ _count, ...project }) => ({
    ...project,
    total: _count.tasks,
    done: done.get(project.id) ?? 0,
  }))
}

export type ProjectProgressRow = Awaited<
  ReturnType<typeof listProjectProgress>
>[number]
