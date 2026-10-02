import { expect, test } from '@playwright/test'

import { toCalendarDay } from '../../src/lib/dates'
import { THEME_STORAGE_KEY } from '../../src/lib/theme'
import { createTestPrismaClient } from '../../src/test/db.ts'
import { expectAccessible } from './accessibility'

import type { Page } from '@playwright/test'

// Tests run in parallel against one database and other specs seed overdue
// tasks too, so every assertion here looks only at this spec's own tasks.
const run = Math.random().toString(36).slice(2, 6).toUpperCase()

const db = createTestPrismaClient()
const names: Array<string> = []

// One unbroken word, so the 320 px check covers a title that has to break
// inside a word.
const LONG_TITLE = `Fix${'thecheckout'.repeat(12)}`

type Seeded = Awaited<ReturnType<typeof seed>>
let seeded: Seeded

/** A UTC midnight Date, which the date column stores as that calendar day. */
function calendarDate(day: string) {
  return new Date(`${day}T00:00:00.000Z`)
}

/** A moment `minutes` from now. */
function minutesFromNow(minutes: number) {
  return new Date(Date.now() + minutes * 60_000)
}

/**
 * A project with a task due today, an overdue high priority task with a long
 * title, and an overdue task completed in Done; and an archived project with
 * an overdue task. Only the first two belong on the dashboard. The activity
 * rows are dated a little ahead, so the rows other specs write meanwhile do
 * not push them out of the latest 20; they read "just now".
 */
async function seed() {
  const today = toCalendarDay(new Date())
  const projectData = (name: string, key: string, archivedAt?: Date) => {
    names.push(name)
    return {
      name,
      key,
      color: '#2563eb',
      nextTaskNumber: 4,
      archivedAt,
      statuses: {
        create: [
          { name: 'Backlog', order: 1, category: 'todo' as const },
          { name: 'Done', order: 2, category: 'done' as const },
        ],
      },
    }
  }
  const project = await db.project.create({
    data: projectData(`Attention ${run}`, `AT${run}`),
    include: { statuses: true },
  })
  const archived = await db.project.create({
    data: projectData(`Shelved ${run}`, `SH${run}`, new Date()),
    include: { statuses: true },
  })
  const status = (of: typeof project, name: string) =>
    of.statuses.find((s) => s.name === name)!.id
  const task = (
    of: typeof project,
    number: number,
    title: string,
    extra: { dueDate: Date; priority?: 'high'; completedAt?: Date },
  ) =>
    db.task.create({
      data: {
        projectId: of.id,
        statusId: status(of, extra.completedAt ? 'Done' : 'Backlog'),
        number,
        title,
        order: number,
        ...extra,
      },
    })
  const dueToday = await task(project, 1, `Due today ${run}`, {
    dueDate: calendarDate(today),
  })
  const overdue = await task(project, 2, LONG_TITLE, {
    dueDate: calendarDate('2000-01-01'),
    priority: 'high',
  })
  const completed = await task(project, 3, `Completed ${run}`, {
    dueDate: calendarDate('2000-01-01'),
    completedAt: new Date('2000-01-02T10:00:00.000Z'),
  })
  const archivedTask = await task(archived, 1, `Archived task ${run}`, {
    dueDate: calendarDate('2000-01-01'),
  })
  await db.activity.createMany({
    data: [
      {
        projectId: project.id,
        taskId: dueToday.id,
        type: 'task.created',
        payload: { number: 1, title: dueToday.title },
        createdAt: minutesFromNow(30),
      },
      // A deleted task: its rows keep the project but lose the task.
      {
        projectId: project.id,
        taskId: null,
        type: 'task.deleted',
        payload: { number: 9, title: `Dropped ${run}` },
        createdAt: minutesFromNow(31),
      },
      {
        projectId: project.id,
        taskId: overdue.id,
        type: 'task.moved',
        payload: { number: 2, from: 'Backlog', to: 'Done' },
        createdAt: minutesFromNow(32),
      },
      {
        projectId: archived.id,
        taskId: archivedTask.id,
        type: 'task.created',
        payload: { number: 1, title: archivedTask.title },
        createdAt: minutesFromNow(33),
      },
    ],
  })
  return { project, archived, dueToday, overdue, completed, archivedTask }
}

test.beforeAll(async () => {
  seeded = await seed()
})

test.afterAll(async () => {
  // Tasks first: a status with tasks cannot be deleted.
  await db.task.deleteMany({ where: { project: { name: { in: names } } } })
  await db.project.deleteMany({ where: { name: { in: names } } })
  await db.$disconnect()
})

/** Waits for hydration, so the page is the one React rendered. */
async function openDashboard(page: Page) {
  await page.goto('/', { waitUntil: 'networkidle' })
  await expect(
    page.getByRole('heading', { level: 1, name: 'Dashboard' }),
  ).toBeVisible()
}

function taskLink(page: Page, section: string, taskId: string) {
  return page
    .getByRole('region', { name: section })
    .locator(`a[href="/tasks/${taskId}"]`)
}

test('lists tasks due today and overdue tasks as links', async ({ page }) => {
  await openDashboard(page)
  const { project, dueToday, overdue } = seeded

  await expect(
    page.getByRole('heading', { level: 2, name: 'Due today' }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { level: 2, name: 'Overdue' }),
  ).toBeVisible()

  const todayLink = taskLink(page, 'Due today', dueToday.id)
  await expect(todayLink).toContainText(`${project.key}-1`)
  await expect(todayLink).toContainText(dueToday.title)
  await expect(todayLink).toContainText(project.name)
  await expect(todayLink).toContainText('No priority')
  await expect(todayLink).not.toContainText('Overdue')

  const overdueLink = taskLink(page, 'Overdue', overdue.id)
  await expect(overdueLink).toContainText(`${project.key}-2`)
  await expect(overdueLink).toContainText(project.name)
  await expect(overdueLink).toContainText('High')
  await expect(overdueLink).toContainText('Due Jan 1, 2000')
  await expect(overdueLink).toContainText('Overdue')

  for (const link of [todayLink, overdueLink]) {
    const box = await link.boundingBox()
    expect(box?.height).toBeGreaterThanOrEqual(44)
  }

  await overdueLink.click()
  await expect(page).toHaveURL(`/tasks/${overdue.id}`)
})

test('leaves out completed tasks and archived projects', async ({ page }) => {
  await openDashboard(page)

  await expect(
    page
      .getByRole('region', { name: 'Due today' })
      .getByText(seeded.dueToday.title),
  ).toBeVisible()
  await expect(page.getByText(seeded.completed.title)).toHaveCount(0)
  await expect(page.getByText(seeded.archivedTask.title)).toHaveCount(0)
})

test('shows recent activity as sentences linking to tasks', async ({
  page,
}) => {
  await openDashboard(page)
  const { project, dueToday } = seeded
  const region = page.getByRole('region', { name: 'Recent activity' })

  await expect(
    page.getByRole('heading', { level: 2, name: 'Recent activity' }),
  ).toBeVisible()

  const created = region.getByRole('listitem').filter({
    has: page.locator(`a[href="/tasks/${dueToday.id}"]`),
  })
  await expect(created.getByRole('link')).toHaveText(`${project.key}-1`)
  await expect(created).toContainText(project.name)
  await expect(created).toContainText(`Created the task “${dueToday.title}”.`)

  const deleted = region
    .getByRole('listitem')
    .filter({ hasText: `${project.key}-9` })
  await expect(deleted).toContainText(`Deleted the task “Dropped ${run}”.`)
  await expect(deleted.getByRole('link')).toHaveCount(0)

  await expect(region).not.toContainText('Recorded the event')
  await expect(region.getByText(seeded.archivedTask.title)).toHaveCount(0)

  const mine = region
    .getByRole('listitem')
    .filter({ hasText: project.name })
    .locator('time')
  await expect(mine).toHaveCount(3)
  for (const time of await mine.all()) {
    await expect(time).toHaveAttribute('datetime', /^\d{4}-\d{2}-\d{2}T/)
    await expect(time).toHaveText(/^(just now|.+ ago) \(.+\)$/)
  }
})

test('lists unarchived projects with their progress', async ({ page }) => {
  await openDashboard(page)
  const { project, archived } = seeded
  const region = page.getByRole('region', { name: 'Projects' })

  await expect(
    page.getByRole('heading', { level: 2, name: 'Projects' }),
  ).toBeVisible()
  const row = region
    .getByRole('listitem')
    .filter({ has: page.getByRole('link', { name: project.name }) })
  await expect(row.getByRole('link')).toHaveAttribute(
    'href',
    `/projects/${project.id}/board`,
  )
  await expect(row).toContainText('1 of 3 tasks done')
  await expect(region.getByText(archived.name)).toHaveCount(0)
})

test('updates progress and activity when returning to the dashboard', async ({
  page,
}) => {
  const name = `Returning ${run}`
  names.push(name)
  const other = await db.project.create({
    data: {
      name,
      key: `RE${run}`,
      color: '#2563eb',
      nextTaskNumber: 2,
      statuses: { create: [{ name: 'Backlog', order: 1, category: 'todo' }] },
    },
    include: { statuses: true },
  })
  const task = await db.task.create({
    data: {
      projectId: other.id,
      statusId: other.statuses[0].id,
      number: 1,
      title: `Finish ${run}`,
      order: 1,
    },
  })
  await openDashboard(page)
  const row = page
    .getByRole('region', { name: 'Projects' })
    .getByRole('listitem')
    .filter({ has: page.getByRole('link', { name }) })
  await expect(row).toContainText('0 of 1 task done')

  // Completed elsewhere, as the assistant or REST would.
  await db.task.update({
    where: { id: task.id },
    data: { completedAt: new Date() },
  })
  await db.activity.create({
    data: {
      projectId: other.id,
      taskId: task.id,
      type: 'task.completed',
      payload: { number: 1 },
      createdAt: minutesFromNow(40),
    },
  })
  const main = page.getByRole('navigation', { name: 'Main' })
  await main.getByRole('link', { name: 'Help', exact: true }).click()
  await expect(page).toHaveURL('/help')
  // Marks the document: a full reload would lose it.
  await page.evaluate(() => {
    ;(window as { stayed?: boolean }).stayed = true
  })
  await main.getByRole('link', { name: 'Dashboard', exact: true }).click()
  await expect(page).toHaveURL('/')

  await expect(row).toContainText('1 of 1 task done')
  await expect(
    page
      .getByRole('region', { name: 'Recent activity' })
      .getByRole('listitem')
      .filter({ hasText: `${other.key}-1` }),
  ).toContainText('Completed the task.')
  expect(
    await page.evaluate(() => (window as { stayed?: boolean }).stayed),
  ).toBe(true)
})

for (const theme of ['light', 'dark'] as const) {
  test(`the dashboard has no axe violations in the ${theme} theme`, async ({
    page,
  }) => {
    await page.addInitScript(
      ([key, value]) => localStorage.setItem(key, value),
      [THEME_STORAGE_KEY, theme],
    )
    await openDashboard(page)
    if (theme === 'dark') {
      await expect(page.locator('html')).toHaveClass(/\bdark\b/)
    }
    await expect(taskLink(page, 'Overdue', seeded.overdue.id)).toBeVisible()
    await expect(
      page.getByRole('region', { name: 'Projects' }).getByRole('link', {
        name: seeded.project.name,
      }),
    ).toBeVisible()
    await expectAccessible(page)
  })
}

test('the dashboard reflows at 320 px without horizontal scrolling', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await openDashboard(page)

  await expect(taskLink(page, 'Overdue', seeded.overdue.id)).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'Projects' }).getByRole('link', {
      name: seeded.project.name,
    }),
  ).toBeVisible()
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
})
