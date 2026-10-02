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

/**
 * A project with a task due today, an overdue high priority task with a long
 * title, and an overdue task completed in Done; and an archived project with
 * an overdue task. Only the first two belong on the dashboard.
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
  return { project, dueToday, overdue, completed, archivedTask }
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

  await expect(page.getByText(seeded.dueToday.title)).toBeVisible()
  await expect(page.getByText(seeded.completed.title)).toHaveCount(0)
  await expect(page.getByText(seeded.archivedTask.title)).toHaveCount(0)
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
    await expectAccessible(page)
  })
}

test('the dashboard reflows at 320 px without horizontal scrolling', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await openDashboard(page)

  await expect(taskLink(page, 'Overdue', seeded.overdue.id)).toBeVisible()
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
})
