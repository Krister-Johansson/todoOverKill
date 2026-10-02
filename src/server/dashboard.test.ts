// @vitest-environment node
// Server code runs without `window`. Under jsdom, t3-env treats the module as
// client code and blocks every server variable.
import * as z from 'zod'
import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '#/server/db'
import { listDashboardTasks } from '#/server/dashboard'
import { archiveProject, createProject } from '#/server/projects'
import { completeTask, createTask } from '#/server/tasks'
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
