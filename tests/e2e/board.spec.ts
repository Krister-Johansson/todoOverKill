import { expect, test } from '@playwright/test'

import { THEME_STORAGE_KEY } from '../../src/lib/theme'
import { createTestPrismaClient } from '../../src/test/db.ts'
import { expectAccessible } from './accessibility'

import type { Page } from '@playwright/test'

// Tests run in parallel against one database, and keys are unique, so every
// project here gets its own name and key.
const run = Math.random().toString(36).slice(2, 6).toUpperCase()
let counter = 0

function unique(label: string) {
  counter += 1
  return { name: `${label} ${run}${counter}`, key: `B${run}${counter}` }
}

const db = createTestPrismaClient()
const names: Array<string> = []

/**
 * A project whose statuses are created out of order, with an overdue high
 * priority task with two labels in Backlog, a bare task in Todo, and nothing
 * in Done.
 */
async function seedBoard(label: string) {
  const { name, key } = unique(label)
  names.push(name)
  const project = await db.project.create({
    data: {
      name,
      key,
      color: '#2563eb',
      nextTaskNumber: 3,
      // Created in this order on purpose: the board sorts by Status.order.
      statuses: {
        create: [
          { name: 'Done', order: 3, category: 'done' },
          { name: 'Backlog', order: 1, category: 'todo' },
          { name: 'Todo', order: 2, category: 'todo' },
        ],
      },
      labels: {
        create: [
          { name: 'Bug', color: '#dc2626' },
          { name: 'Design', color: '#7c3aed' },
        ],
      },
    },
    include: { statuses: true, labels: true },
  })
  const status = (statusName: string) =>
    project.statuses.find((s) => s.name === statusName)!.id
  const overdue = await db.task.create({
    data: {
      projectId: project.id,
      statusId: status('Backlog'),
      number: 1,
      title: 'Ship the overdue fix',
      priority: 'high',
      dueDate: new Date('2000-01-01T00:00:00.000Z'),
      order: 1,
      labels: {
        create: project.labels.map((projectLabel) => ({
          labelId: projectLabel.id,
        })),
      },
    },
  })
  const plain = await db.task.create({
    data: {
      projectId: project.id,
      statusId: status('Todo'),
      number: 2,
      title: 'Write the plain task',
      order: 1,
    },
  })
  return { project, overdue, plain }
}

/** A project with six empty statuses, wider than the board at 1280 px. */
async function seedWideBoard(label: string) {
  const { name, key } = unique(label)
  names.push(name)
  return db.project.create({
    data: {
      name,
      key,
      color: '#2563eb',
      statuses: {
        create: ['One', 'Two', 'Three', 'Four', 'Five', 'Six'].map(
          (statusName, index) => ({
            name: statusName,
            order: index + 1,
            category: 'todo' as const,
          }),
        ),
      },
    },
  })
}

test.afterAll(async () => {
  // Tasks first: a status with tasks cannot be deleted.
  await db.task.deleteMany({ where: { project: { name: { in: names } } } })
  await db.project.deleteMany({ where: { name: { in: names } } })
  await db.$disconnect()
})

function sidebar(page: Page) {
  return page.getByRole('navigation', { name: 'Main' })
}

function board(page: Page) {
  return page.getByRole('region', { name: 'Board columns' })
}

/** Waits for hydration, so clicks and key presses reach React. */
async function openBoard(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}/board`, { waitUntil: 'networkidle' })
}

async function hasHorizontalPageScroll(page: Page) {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  )
}

test('the sidebar opens the board, with columns in status order', async ({
  page,
}) => {
  const { project } = await seedBoard('Order')
  await page.goto('/', { waitUntil: 'networkidle' })

  const link = sidebar(page).getByRole('link', { name: project.name })
  await link.click()

  await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/board$`))
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(project.name)
  await expect(page).toHaveTitle(`${project.name} · todoOverKill`)
  await expect(link).toHaveAttribute('aria-current', 'page')
  await expect(
    page
      .getByRole('navigation', { name: 'Project views' })
      .getByRole('link', { name: 'Board' }),
  ).toHaveAttribute('aria-current', 'page')
  await expect(board(page).getByRole('heading', { level: 2 })).toHaveText([
    'Backlog 1 task',
    'Todo 1 task',
    'Done 0 tasks',
  ])
  await expect(
    board(page).getByRole('region', { name: /^Done/ }).getByText('No tasks'),
  ).toBeVisible()
})

test('cards link to their task and show its details', async ({ page }) => {
  const { project, overdue, plain } = await seedBoard('Cards')
  await openBoard(page, project.id)

  const cards = board(page).getByRole('link')
  await expect(cards).toHaveCount(2)
  for (const card of await cards.all()) {
    const box = await card.boundingBox()
    expect(box?.height).toBeGreaterThanOrEqual(44)
    expect(box?.width).toBeGreaterThanOrEqual(44)
  }

  const overdueCard = board(page).getByRole('link', {
    name: /Ship the overdue/,
  })
  await expect(overdueCard).toHaveAttribute('href', `/tasks/${overdue.id}`)
  await expect(overdueCard).toContainText(`${project.key}-1`)
  await expect(overdueCard).toContainText('High')
  await expect(overdueCard).toContainText('Due Jan 1, 2000')
  await expect(overdueCard).toContainText('Overdue')
  await expect(overdueCard.getByRole('listitem')).toHaveText([
    /Bug$/,
    /Design$/,
  ])
  // Hidden commas keep the parts of the name apart for screen readers.
  await expect(overdueCard).toHaveAccessibleName(
    new RegExp(
      `^${project.key}-1\\s*,\\s*Ship the overdue fix\\s*,\\s*High\\s*,\\s*Due Jan 1, 2000\\s*,\\s*Overdue\\s*,\\s*Bug\\s*,\\s*Design$`,
    ),
  )

  const plainCard = board(page).getByRole('link', { name: /Write the plain/ })
  await expect(plainCard).toHaveAttribute('href', `/tasks/${plain.id}`)
  await expect(plainCard).toContainText('No priority')
  await expect(plainCard.locator('time')).toHaveCount(0)
  await expect(plainCard).not.toContainText('Overdue')
})

for (const theme of ['light', 'dark'] as const) {
  test(`the board has no axe violations in the ${theme} theme`, async ({
    page,
  }) => {
    const { project } = await seedBoard(`Axe ${theme}`)
    await page.addInitScript(
      ([key, value]) => localStorage.setItem(key, value),
      [THEME_STORAGE_KEY, theme],
    )
    await openBoard(page, project.id)
    await expectAccessible(page)
  })
}

test('a wide board scrolls inside its region, not the page', async ({
  page,
}) => {
  const project = await seedWideBoard('Wide')
  await openBoard(page, project.id)
  await expect(board(page).getByRole('heading', { level: 2 })).toHaveCount(6)
  // Focusable only once it overflows, so keyboard users can scroll it.
  await expect(board(page)).toHaveAttribute('tabindex', '0')

  await expectAccessible(page)
  const overflows = await board(page).evaluate(
    (region) => region.scrollWidth > region.clientWidth,
  )
  expect(overflows).toBe(true)
  expect(await hasHorizontalPageScroll(page)).toBe(false)
})

test('a card is reached by Tab and opened with Enter', async ({ page }) => {
  const { project, overdue } = await seedBoard('Keyboard')
  await openBoard(page, project.id)

  const card = board(page).getByRole('link', { name: /Ship the overdue/ })
  for (let i = 0; i < 60; i += 1) {
    await page.keyboard.press('Tab')
    if (await card.evaluate((el) => el === document.activeElement)) break
  }
  await expect(card).toBeFocused()
  await page.keyboard.press('Enter')

  await expect(page).toHaveURL(new RegExp(`/tasks/${overdue.id}$`))
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    `${project.key}-1 Ship the overdue fix`,
  )
  // The temporary task page is a new page until F17 replaces it.
  await expectAccessible(page)
})

test('the bare project URL opens the board', async ({ page }) => {
  const { project } = await seedBoard('Redirect')
  await page.goto(`/projects/${project.id}`)

  await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/board$`))
  await expect(board(page)).toBeVisible()
})

// 320 CSS px wide is what a 1280 px window shows at 400% zoom.
test('the columns stack at 320 px without horizontal scrolling', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 })
  const { project } = await seedBoard('Narrow')
  await openBoard(page, project.id)

  const columns = board(page).getByRole('region')
  await expect(columns).toHaveCount(3)
  const first = await columns.nth(0).boundingBox()
  const second = await columns.nth(1).boundingBox()
  expect(first && second).toBeTruthy()
  expect(second!.y).toBeGreaterThanOrEqual(first!.y + first!.height)
  expect(await hasHorizontalPageScroll(page)).toBe(false)
  // Stacked columns do not scroll sideways, so the region is no Tab stop.
  await expect(board(page)).not.toHaveAttribute('tabindex')
})
