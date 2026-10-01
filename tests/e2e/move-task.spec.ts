import { expect, test } from '@playwright/test'

import { THEME_STORAGE_KEY } from '../../src/lib/theme'
import { createTestPrismaClient } from '../../src/test/db.ts'
import { expectAccessible } from './accessibility'

import type { Locator, Page } from '@playwright/test'

// Tests run in parallel against one database, and keys are unique, so every
// project here gets its own name and key.
const run = Math.random().toString(36).slice(2, 6).toUpperCase()
let counter = 0

function unique(label: string) {
  counter += 1
  return { name: `${label} ${run}${counter}`, key: `M${run}${counter}` }
}

const db = createTestPrismaClient()
const names: Array<string> = []

/**
 * A project with Backlog, In progress and Done, and two tasks in Backlog:
 * KEY-1 above KEY-2.
 */
async function seedProject(label: string) {
  const { name, key } = unique(label)
  names.push(name)
  const project = await db.project.create({
    data: {
      name,
      key,
      color: '#2563eb',
      nextTaskNumber: 3,
      statuses: {
        create: [
          { name: 'Backlog', order: 1, category: 'todo' },
          { name: 'In progress', order: 2, category: 'in_progress' },
          { name: 'Done', order: 3, category: 'done' },
        ],
      },
    },
    include: { statuses: true },
  })
  const status = (statusName: string) =>
    project.statuses.find((s) => s.name === statusName)!
  for (const number of [1, 2]) {
    await db.task.create({
      data: {
        projectId: project.id,
        statusId: status('Backlog').id,
        number,
        title: `Task number ${number}`,
        order: number,
      },
    })
  }
  return { project, key, status }
}

test.afterAll(async () => {
  // Tasks first: a status with tasks cannot be deleted.
  await db.task.deleteMany({ where: { project: { name: { in: names } } } })
  await db.project.deleteMany({ where: { name: { in: names } } })
  await db.$disconnect()
})

function column(page: Page, name: string) {
  return page.getByRole('region', { name: new RegExp(`^${name}`) })
}

function moveButton(scope: Page | Locator, reference: string) {
  return scope.getByRole('button', { name: `Move ${reference}` })
}

function menu(page: Page) {
  return page.getByRole('menu')
}

function liveRegion(page: Page) {
  return page.locator('[aria-live="polite"]')
}

/** Waits for hydration, so clicks and key presses reach React. */
async function openBoard(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}/board`, { waitUntil: 'networkidle' })
  // Survives only if the page is not reloaded.
  await page.evaluate(() => {
    ;(window as { noReload?: boolean }).noReload = true
  })
}

async function notReloaded(page: Page) {
  return page.evaluate(() => (window as { noReload?: boolean }).noReload)
}

/** Waits for the open animation, so axe and size checks see the final frame. */
async function settle(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  )
}

async function tabTo(page: Page, target: Locator) {
  for (let i = 0; i < 60; i += 1) {
    await page.keyboard.press('Tab')
    if (await target.evaluate((el) => el === document.activeElement)) break
  }
  await expect(target).toBeFocused()
}

/**
 * Opens a card's menu from the keyboard; Radix focuses the first item. A menu
 * reopened during its close animation keeps its content mounted and skips
 * that focus, and arrow keys pressed before the open animation ends can be
 * undone by it, so this waits for animations on both sides.
 */
async function openMenu(page: Page, reference: string) {
  await settle(page)
  await moveButton(page, reference).focus()
  await page.keyboard.press('Enter')
  await expect(menu(page)).toBeVisible()
  await settle(page)
  await expect(
    menu(page).getByRole('menuitemradio', { name: 'Backlog' }),
  ).toBeFocused()
}

async function cardOrder(scope: Locator) {
  return scope
    .getByRole('link')
    .evaluateAll((links) =>
      links.map((link) => link.querySelector('abbr')?.textContent),
    )
}

test('a card moves to another column by keyboard alone', async ({ page }) => {
  const { project, key } = await seedProject('Keyboard')
  await openBoard(page, project.id)

  await tabTo(page, moveButton(page, `${key}-1`))
  await page.keyboard.press('Enter')
  await expect(menu(page)).toBeVisible()
  // The menu is named by its button.
  await expect(page.getByRole('menu', { name: `Move ${key}-1` })).toBeVisible()
  await settle(page)
  await expect(
    menu(page).getByRole('menuitemradio', { name: 'Backlog' }),
  ).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(
    menu(page).getByRole('menuitemradio', { name: 'In progress' }),
  ).toBeFocused()
  await page.keyboard.press('Enter')

  await expect(menu(page)).toHaveCount(0)
  const inProgress = column(page, 'In progress')
  await expect(
    inProgress.getByRole('link', { name: new RegExp(`${key}-1`) }),
  ).toBeVisible()
  await expect(inProgress).toContainText('1 task')
  await expect(column(page, 'Backlog')).toContainText('1 task')
  await expect(liveRegion(page)).toHaveText(`Moved ${key}-1 to In progress`)
  await expect(moveButton(inProgress, `${key}-1`)).toBeFocused()
  expect(await notReloaded(page)).toBe(true)

  await page.reload({ waitUntil: 'networkidle' })
  await expect(
    column(page, 'In progress').getByRole('link', {
      name: new RegExp(`${key}-1`),
    }),
  ).toBeVisible()
})

test('Move down and Move up reorder a card within its column', async ({
  page,
}) => {
  const { project, key } = await seedProject('Reorder')
  await openBoard(page, project.id)
  const backlog = column(page, 'Backlog')

  // KEY-1 is first, so Move up is disabled and End reaches Move down.
  await openMenu(page, `${key}-1`)
  await expect(
    menu(page).getByRole('menuitem', { name: 'Move up' }),
  ).toHaveAttribute('aria-disabled', 'true')
  await page.keyboard.press('End')
  await expect(
    menu(page).getByRole('menuitem', { name: 'Move down' }),
  ).toBeFocused()
  await page.keyboard.press('Enter')

  await expect.poll(() => cardOrder(backlog)).toEqual([`${key}-2`, `${key}-1`])
  await expect(liveRegion(page)).toHaveText(`Moved ${key}-1 down`)
  await expect(moveButton(backlog, `${key}-1`)).toBeFocused()

  // Now last, so Move down is disabled and End reaches Move up.
  await openMenu(page, `${key}-1`)
  await expect(
    menu(page).getByRole('menuitem', { name: 'Move down' }),
  ).toHaveAttribute('aria-disabled', 'true')
  await page.keyboard.press('End')
  await expect(
    menu(page).getByRole('menuitem', { name: 'Move up' }),
  ).toBeFocused()
  await page.keyboard.press('Enter')

  await expect.poll(() => cardOrder(backlog)).toEqual([`${key}-1`, `${key}-2`])
  await expect(liveRegion(page)).toHaveText(`Moved ${key}-1 up`)
  await expect(moveButton(backlog, `${key}-1`)).toBeFocused()
  expect(await notReloaded(page)).toBe(true)

  await page.reload({ waitUntil: 'networkidle' })
  await expect
    .poll(() => cardOrder(column(page, 'Backlog')))
    .toEqual([`${key}-1`, `${key}-2`])
})

test('the current status is checked, and choosing it or Escape changes nothing', async ({
  page,
}) => {
  const { project, key } = await seedProject('Current')
  await openBoard(page, project.id)

  await openMenu(page, `${key}-2`)
  const items = menu(page).getByRole('menuitemradio')
  await expect(items).toHaveText(['Backlog', 'In progress', 'Done'])
  await expect(items.nth(0)).toHaveAttribute('aria-checked', 'true')
  await expect(items.nth(1)).toHaveAttribute('aria-checked', 'false')
  await expect(
    menu(page).getByRole('menuitem', { name: 'Move down' }),
  ).toHaveAttribute('aria-disabled', 'true')
  await page.keyboard.press('Enter')

  await expect(menu(page)).toHaveCount(0)
  await expect(moveButton(page, `${key}-2`)).toBeFocused()
  await expect(column(page, 'Backlog')).toContainText('2 tasks')
  await expect(liveRegion(page)).toHaveText('')

  await openMenu(page, `${key}-2`)
  await page.keyboard.press('Escape')
  await expect(menu(page)).toHaveCount(0)
  await expect(moveButton(page, `${key}-2`)).toBeFocused()
  await expect
    .poll(() => cardOrder(column(page, 'Backlog')))
    .toEqual([`${key}-1`, `${key}-2`])
})

test('a rejected move puts the card back and says so', async ({ page }) => {
  const { project, key, status } = await seedProject('Rejected')
  await openBoard(page, project.id)
  // The menu still lists the status, but the server no longer has it.
  await db.status.delete({ where: { id: status('In progress').id } })

  await openMenu(page, `${key}-1`)
  await page.keyboard.press('ArrowDown')
  await expect(
    menu(page).getByRole('menuitemradio', { name: 'In progress' }),
  ).toBeFocused()
  await page.keyboard.press('Enter')

  await expect(liveRegion(page)).toHaveText(
    `Could not move ${key}-1. Try again.`,
  )
  const backlog = column(page, 'Backlog')
  await expect.poll(() => cardOrder(backlog)).toEqual([`${key}-1`, `${key}-2`])
  await expect(moveButton(backlog, `${key}-1`)).toBeFocused()
  // The refetched project drops the deleted status.
  await expect(column(page, 'In progress')).toHaveCount(0)
  expect(await notReloaded(page)).toBe(true)

  await page.reload({ waitUntil: 'networkidle' })
  await expect
    .poll(() => cardOrder(column(page, 'Backlog')))
    .toEqual([`${key}-1`, `${key}-2`])
})

test('the open menu hides nothing from assistive technology', async ({
  page,
}) => {
  const { project, key } = await seedProject('Live')
  await openBoard(page, project.id)

  await openMenu(page, `${key}-1`)
  const hidden = await liveRegion(page).evaluate(
    (region) => region.closest('[aria-hidden="true"], [inert]') !== null,
  )
  expect(hidden).toBe(false)
  await expect(page.locator('main [aria-hidden="true"] a')).toHaveCount(0)
})

test('Move buttons and menu items are at least 44 by 44 px', async ({
  page,
}) => {
  const { project, key } = await seedProject('Targets')
  await openBoard(page, project.id)

  for (const reference of [`${key}-1`, `${key}-2`]) {
    const box = await moveButton(page, reference).boundingBox()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
  }
  await openMenu(page, `${key}-1`)
  await settle(page)
  const items = menu(page).locator('[role^="menuitem"]')
  for (const item of await items.all()) {
    const box = await item.boundingBox()
    expect(box!.height).toBeGreaterThanOrEqual(44)
    expect(box!.width).toBeGreaterThanOrEqual(44)
  }
})

for (const theme of ['light', 'dark'] as const) {
  test(`the board with an open menu has no axe violations in the ${theme} theme`, async ({
    page,
  }) => {
    const { project, key } = await seedProject(`Axe ${theme}`)
    await page.addInitScript(
      ([storageKey, value]) => localStorage.setItem(storageKey, value),
      [THEME_STORAGE_KEY, theme],
    )
    await openBoard(page, project.id)
    await openMenu(page, `${key}-2`)
    await settle(page)
    await expectAccessible(page)
  })
}

// 320 CSS px wide is what a 1280 px window shows at 400% zoom.
test('cards with Move buttons fit at 320 px without horizontal scrolling', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 })
  const { project, key } = await seedProject('Narrow')
  await openBoard(page, project.id)

  await expect(moveButton(page, `${key}-1`)).toBeVisible()
  await openMenu(page, `${key}-1`)
  await settle(page)
  const scrolls = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  )
  expect(scrolls).toBe(false)
  const box = await menu(page).boundingBox()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(320)
})
