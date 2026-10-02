// @vitest-environment node
// Server code runs without `window`. Under jsdom, t3-env treats the module as
// client code and blocks every server variable.
import * as z from 'zod'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Prisma } from '#/generated/prisma/client'
import { db } from '#/server/db'
import {
  RECENT_ACTIVITY_LIMIT,
  listDashboardTasks,
  listProjectProgress,
  listRecentActivity,
} from '#/server/dashboard'
import { archiveProject, createProject } from '#/server/projects'
import { completeTask, createTask, deleteTask } from '#/server/tasks'
import { resetDatabase } from '#/test/db'

const TODAY = '2026-10-02'

beforeEach(() => resetDatabase(db))

function titles(tasks: Array<{ title: string }>) {
  return tasks.map((task) => task.title)
}

describe('listDashboardTasks', () => {
  it('puts a task due today in dueToday', async () => {
    const project = await createProject({ name: 'Website', key: 'WEB' })
    await createTask(project.id, { title: 'Ship it', dueDate: TODAY })

    const { dueToday, overdue } = await listDashboardTasks(TODAY)

    expect(titles(dueToday)).toEqual(['Ship it'])
    expect(overdue).toEqual([])
  })

  it('puts tasks due before today in overdue, oldest first', async () => {
    const project = await createProject({ name: 'Website', key: 'WEB' })
    await createTask(project.id, { title: 'Yesterday', dueDate: '2026-10-01' })
    await createTask(project.id, { title: 'Long ago', dueDate: '2000-01-01' })

    const { dueToday, overdue } = await listDashboardTasks(TODAY)

    expect(dueToday).toEqual([])
    expect(titles(overdue)).toEqual(['Long ago', 'Yesterday'])
  })

  it('leaves out completed tasks', async () => {
    const project = await createProject({ name: 'Website', key: 'WEB' })
    const late = await createTask(project.id, {
      title: 'Done late',
      dueDate: '2026-10-01',
    })
    const onTime = await createTask(project.id, {
      title: 'Done today',
      dueDate: TODAY,
    })
    await completeTask(late.id)
    await completeTask(onTime.id)

    expect(await listDashboardTasks(TODAY)).toEqual({
      dueToday: [],
      overdue: [],
    })
  })

  it('leaves out tasks of archived projects', async () => {
    const archived = await createProject({ name: 'Old site', key: 'OLD' })
    await createTask(archived.id, { title: 'Today', dueDate: TODAY })
    await createTask(archived.id, { title: 'Late', dueDate: '2026-10-01' })
    await archiveProject(archived.id)

    expect(await listDashboardTasks(TODAY)).toEqual({
      dueToday: [],
      overdue: [],
    })
  })

  it('leaves out tasks due later and tasks with no due date', async () => {
    const project = await createProject({ name: 'Website', key: 'WEB' })
    await createTask(project.id, { title: 'Tomorrow', dueDate: '2026-10-03' })
    await createTask(project.id, { title: 'Someday' })

    expect(await listDashboardTasks(TODAY)).toEqual({
      dueToday: [],
      overdue: [],
    })
  })

  it('gives each task its project, a calendar day and flat labels', async () => {
    const project = await createProject({ name: 'Website', key: 'WEB' })
    const label = await db.label.create({
      data: { projectId: project.id, name: 'Bug', color: '#1d4ed8' },
    })
    await createTask(project.id, {
      title: 'Ship it',
      dueDate: TODAY,
      labelIds: [label.id],
    })

    const [task] = (await listDashboardTasks(TODAY)).dueToday

    expect(task.project).toEqual({
      id: project.id,
      name: 'Website',
      key: 'WEB',
    })
    expect(task.number).toBe(1)
    expect(task.dueDate).toBe(TODAY)
    expect(task.status.name).toBe('Backlog')
    expect(task.labels).toEqual([label])
  })

  it('orders by due date, then project name, then key, then number', async () => {
    const zoo = await createProject({ name: 'Zoo', key: 'ZOO' })
    const app = await createProject({ name: 'App', key: 'APP' })
    await createTask(zoo.id, { title: 'ZOO-1', dueDate: '2026-09-30' })
    await createTask(zoo.id, { title: 'ZOO-2', dueDate: '2026-09-29' })
    await createTask(app.id, { title: 'APP-1', dueDate: '2026-09-30' })
    await createTask(zoo.id, { title: 'ZOO-3', dueDate: '2026-09-30' })
    await createTask(app.id, { title: 'APP-2', dueDate: '2026-09-30' })

    const { overdue } = await listDashboardTasks(TODAY)

    expect(titles(overdue)).toEqual([
      'ZOO-2',
      'APP-1',
      'APP-2',
      'ZOO-1',
      'ZOO-3',
    ])
  })

  it('orders projects with the same name by key', async () => {
    const web = await createProject({ name: 'Website', key: 'WEB' })
    const site = await createProject({ name: 'Website', key: 'SITE' })
    await createTask(web.id, { title: 'WEB-1', dueDate: '2026-10-01' })
    await createTask(site.id, { title: 'SITE-1', dueDate: '2026-10-01' })

    const { overdue } = await listDashboardTasks(TODAY)

    expect(overdue.map((task) => [task.project.key, task.number])).toEqual([
      ['SITE', 1],
      ['WEB', 1],
    ])
  })

  it('takes tasks from every unarchived project in one list', async () => {
    const web = await createProject({ name: 'Website', key: 'WEB' })
    const app = await createProject({ name: 'App', key: 'APP' })
    await createTask(web.id, { title: 'Web today', dueDate: TODAY })
    await createTask(app.id, { title: 'App today', dueDate: TODAY })

    const { dueToday } = await listDashboardTasks(TODAY)

    expect(titles(dueToday)).toEqual(['App today', 'Web today'])
  })

  it('throws a ZodError when today is not a calendar day', async () => {
    await expect(listDashboardTasks('tomorrow')).rejects.toBeInstanceOf(
      z.ZodError,
    )
  })
})

async function doneStatusId(projectId: string) {
  const status = await db.status.findFirstOrThrow({
    where: { projectId, category: 'done' },
  })
  return status.id
}

/**
 * Dates the activity rows each filter matches a minute apart, oldest first.
 * Rows written in the same millisecond come back in id order, not write
 * order, so the order tests set the times themselves.
 */
async function dateInOrder(filters: Array<Prisma.ActivityWhereInput>) {
  for (const [minute, where] of filters.entries()) {
    await db.activity.updateMany({
      where,
      data: { createdAt: new Date(Date.UTC(2026, 9, 1, 12, minute)) },
    })
  }
}

describe('listRecentActivity', () => {
  it('returns rows newest first, each with its project and task', async () => {
    const project = await createProject({ name: 'Website', key: 'WEB' })
    const task = await createTask(project.id, { title: 'Ship it' })
    await completeTask(task.id)
    await dateInOrder([
      { type: 'project.created' },
      { type: 'task.created' },
      { type: 'task.completed' },
    ])

    const rows = await listRecentActivity()

    expect(rows.map((row) => row.type)).toEqual([
      'task.completed',
      'task.created',
      'project.created',
    ])
    expect(rows[0].project).toEqual({
      id: project.id,
      name: 'Website',
      key: 'WEB',
    })
    expect(rows[0].task).toEqual({ id: task.id, number: 1 })
    expect(rows[2].task).toBeNull()
  })

  it('returns at most the limit, keeping the newest', async () => {
    const project = await createProject({ name: 'Website', key: 'WEB' })
    const first = await createTask(project.id, { title: 'First' })
    const second = await createTask(project.id, { title: 'Second' })
    await dateInOrder([
      { type: 'project.created' },
      { taskId: first.id },
      { taskId: second.id },
    ])

    const rows = await listRecentActivity(2)

    expect(rows.map((row) => row.payload)).toEqual([
      expect.objectContaining({ title: 'Second' }),
      expect.objectContaining({ title: 'First' }),
    ])
  })

  it('shows at most 20 rows by default', async () => {
    expect(RECENT_ACTIVITY_LIMIT).toBe(20)
    const project = await createProject({ name: 'Website', key: 'WEB' })
    for (let i = 0; i < 21; i++) {
      await createTask(project.id, { title: `Task ${i}` })
    }

    expect(await listRecentActivity()).toHaveLength(20)
  })

  it('leaves out the rows of archived projects', async () => {
    const archived = await createProject({ name: 'Old site', key: 'OLD' })
    await createTask(archived.id, { title: 'Gone' })
    await archiveProject(archived.id)
    await createProject({ name: 'Website', key: 'WEB' })

    const rows = await listRecentActivity()

    expect(rows.map((row) => [row.project.key, row.type])).toEqual([
      ['WEB', 'project.created'],
    ])
  })

  it('keeps a deleted task’s rows with no task', async () => {
    const project = await createProject({ name: 'Website', key: 'WEB' })
    const task = await createTask(project.id, { title: 'Drop it' })
    await deleteTask(task.id)
    await dateInOrder([
      { type: 'project.created' },
      { type: 'task.created' },
      { type: 'task.deleted' },
    ])

    const [deleted, created] = await listRecentActivity()

    expect(deleted.type).toBe('task.deleted')
    expect(deleted.task).toBeNull()
    expect(deleted.payload).toEqual(
      expect.objectContaining({ number: 1, title: 'Drop it' }),
    )
    expect(deleted.project.key).toBe('WEB')
    expect(created.task).toBeNull()
  })
})

describe('listProjectProgress', () => {
  it('counts every task and the completed ones per project', async () => {
    const project = await createProject({ name: 'Website', key: 'WEB' })
    const first = await createTask(project.id, { title: 'One' })
    await createTask(project.id, { title: 'Two' })
    await createTask(project.id, { title: 'Three' })
    await completeTask(first.id)

    expect(await listProjectProgress()).toEqual([
      { id: project.id, name: 'Website', key: 'WEB', total: 3, done: 1 },
    ])
  })

  it('counts a task created in a Done status as done', async () => {
    const project = await createProject({ name: 'Website', key: 'WEB' })
    await createTask(project.id, {
      title: 'Already done',
      statusId: await doneStatusId(project.id),
    })

    const [row] = await listProjectProgress()

    expect([row.total, row.done]).toEqual([1, 1])
  })

  it('lists a project with no tasks as 0 of 0', async () => {
    await createProject({ name: 'Website', key: 'WEB' })

    const [row] = await listProjectProgress()

    expect([row.total, row.done]).toEqual([0, 0])
  })

  it('leaves out archived projects', async () => {
    const archived = await createProject({ name: 'Old site', key: 'OLD' })
    const task = await createTask(archived.id, { title: 'Gone' })
    await completeTask(task.id)
    await archiveProject(archived.id)

    expect(await listProjectProgress()).toEqual([])
  })

  it('orders by name, then key', async () => {
    await createProject({ name: 'Website', key: 'WEB' })
    await createProject({ name: 'App', key: 'APP' })
    await createProject({ name: 'Website', key: 'SITE' })

    const rows = await listProjectProgress()

    expect(rows.map((row) => row.key)).toEqual(['APP', 'SITE', 'WEB'])
  })
})

describe('the dashboard reads', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  /** A project with two tasks, one of them completed. */
  async function seedProject(key: string) {
    const project = await createProject({ name: `Project ${key}`, key })
    const task = await createTask(project.id, { title: 'One' })
    await createTask(project.id, { title: 'Two' })
    await completeTask(task.id)
  }

  /** How many times each Prisma call ran while both reads ran once. */
  async function countCalls() {
    const spies = {
      activityFindMany: vi.spyOn(db.activity, 'findMany'),
      projectFindMany: vi.spyOn(db.project, 'findMany'),
      taskGroupBy: vi.spyOn(db.task, 'groupBy'),
      taskFindMany: vi.spyOn(db.task, 'findMany'),
      taskCount: vi.spyOn(db.task, 'count'),
    }
    await listRecentActivity()
    await listProjectProgress()
    const counts = Object.fromEntries(
      Object.entries(spies).map(([name, spy]) => [name, spy.mock.calls.length]),
    )
    vi.restoreAllMocks()
    return counts
  }

  it('make the same Prisma calls for one project as for five', async () => {
    await seedProject('ONE')
    const one = await countCalls()
    for (const key of ['TWO', 'THREE', 'FOUR', 'FIVE']) await seedProject(key)

    const five = await countCalls()

    expect(one).toEqual({
      activityFindMany: 1,
      projectFindMany: 1,
      taskGroupBy: 1,
      taskFindMany: 0,
      taskCount: 0,
    })
    expect(five).toEqual(one)
    expect(await listProjectProgress()).toHaveLength(5)
  })
})
