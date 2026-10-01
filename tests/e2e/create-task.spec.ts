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
  return { name: `${label} ${run}${counter}`, key: `T${run}${counter}` }
}

const db = createTestPrismaClient()
const names: Array<string> = []

/** An empty project with three statuses in order. */
async function seedProject(label: string) {
  const { name, key } = unique(label)
  names.push(name)
  return db.project.create({
    data: {
      name,
      key,
      color: '#2563eb',
      statuses: {
        create: [
          { name: 'Backlog', order: 1, category: 'todo' },
          { name: 'Doing', order: 2, category: 'in_progress' },
          { name: 'Done', order: 3, category: 'done' },
        ],
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

function newTaskButton(page: Page) {
  return page.getByRole('banner').getByRole('button', { name: 'New task' })
}

function dialog(page: Page) {
  return page.getByRole('dialog', { name: 'New task' })
}

function titleField(page: Page) {
  return dialog(page).getByRole('textbox', { name: 'Title (required)' })
}

/** Waits for hydration, so clicks and key presses reach React. */
async function openBoard(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}/board`, { waitUntil: 'networkidle' })
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

async function openDialog(page: Page) {
  await newTaskButton(page).click()
  await expect(dialog(page)).toBeVisible()
  await settle(page)
}

async function tabTo(page: Page, target: Locator) {
  for (let i = 0; i < 60; i += 1) {
    await page.keyboard.press('Tab')
    if (await target.evaluate((el) => el === document.activeElement)) break
  }
  await expect(target).toBeFocused()
}

test('a task is created by keyboard and its card takes focus', async ({
  page,
}) => {
  const project = await seedProject('Create')
  await openBoard(page, project.id)
  // Survives only if the page is not reloaded.
  await page.evaluate(() => {
    ;(window as { noReload?: boolean }).noReload = true
  })

  await tabTo(page, newTaskButton(page))
  await page.keyboard.press('Enter')
  await expect(dialog(page)).toBeVisible()
  await expect(titleField(page)).toBeFocused()
  // The project comes from the route and is not asked for.
  await expect(dialog(page)).toContainText(`Add a task to ${project.name}.`)
  await expect(dialog(page).getByRole('combobox')).toHaveCount(2)

  await page.keyboard.type('Write the release notes')
  const status = dialog(page).getByRole('combobox', { name: 'Status' })
  await tabTo(page, status)
  await status.selectOption({ label: 'Doing' })
  const priority = dialog(page).getByRole('combobox', { name: 'Priority' })
  await tabTo(page, priority)
  await priority.selectOption({ label: 'High' })
  const dueDate = dialog(page).getByLabel('Due date')
  await tabTo(page, dueDate)
  await dueDate.fill('2026-12-24')
  await tabTo(page, dialog(page).getByRole('button', { name: 'Create task' }))
  await page.keyboard.press('Enter')

  await expect(dialog(page)).toHaveCount(0)
  const column = page.getByRole('region', { name: /^Doing/ })
  const card = column.getByRole('link', {
    name: new RegExp(`${project.key}-1`),
  })
  await expect(card).toBeFocused()
  await expect(card).toBeInViewport()
  await expect(card).toContainText('Write the release notes')
  await expect(card).toContainText('High')
  await expect(card).toContainText('Due Dec 24, 2026')
  await expect(column).toContainText('1 task')
  await expect(page.locator('[aria-live="polite"]')).toHaveText(
    `Task ${project.key}-1 created`,
  )
  expect(
    await page.evaluate(() => (window as { noReload?: boolean }).noReload),
  ).toBe(true)
})

test('c opens the dialog on the board with an empty Title field', async ({
  page,
}) => {
  const project = await seedProject('Shortcut')
  await openBoard(page, project.id)

  await page.keyboard.press('c')

  await expect(dialog(page)).toBeVisible()
  await expect(titleField(page)).toBeFocused()
  await expect(titleField(page)).toHaveValue('')

  // A second c types into the field and opens nothing more.
  await page.keyboard.press('c')
  await expect(titleField(page)).toHaveValue('c')
  await expect(page.getByRole('dialog')).toHaveCount(1)
})

test('c in the search box types a c and opens nothing', async ({ page }) => {
  const project = await seedProject('Search')
  await openBoard(page, project.id)

  const search = page.getByRole('searchbox', { name: 'Search' })
  await search.focus()
  await page.keyboard.press('c')

  await expect(search).toHaveValue('c')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('c opens nothing when shortcuts are off in Settings', async ({ page }) => {
  const project = await seedProject('Off')
  await page.addInitScript(() =>
    localStorage.setItem('todoOverKill.shortcuts', 'off'),
  )
  await openBoard(page, project.id)

  await page.keyboard.press('c')

  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(newTaskButton(page)).toBeVisible()
})

for (const path of ['/settings', '/help']) {
  test(`${path} has no New task button and c opens nothing`, async ({
    page,
  }) => {
    await page.goto(path, { waitUntil: 'networkidle' })

    await expect(newTaskButton(page)).toHaveCount(0)
    await page.keyboard.press('c')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })
}

test('c opens nothing while the New project dialog is open', async ({
  page,
}) => {
  const project = await seedProject('Other dialog')
  await openBoard(page, project.id)

  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('button', { name: 'New project' })
    .click()
  const projectDialog = page.getByRole('dialog', { name: 'New project' })
  await expect(projectDialog).toBeVisible()
  await projectDialog.getByRole('button', { name: 'Cancel' }).focus()
  await page.keyboard.press('c')

  await expect(page.getByRole('dialog')).toHaveCount(1)
  await expect(dialog(page)).toHaveCount(0)
})

test('Escape and Cancel return focus to the New task button', async ({
  page,
}) => {
  const project = await seedProject('Close')
  await openBoard(page, project.id)

  await openDialog(page)
  await page.keyboard.press('Escape')
  await expect(dialog(page)).toHaveCount(0)
  await expect(newTaskButton(page)).toBeFocused()

  await openDialog(page)
  await dialog(page).getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog(page)).toHaveCount(0)
  await expect(newTaskButton(page)).toBeFocused()

  // Opened with c, Escape still lands on the button.
  await page.locator('main').focus()
  await page.keyboard.press('c')
  await expect(dialog(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(newTaskButton(page)).toBeFocused()
})

test('an empty submit shows the error inline and in a focused summary', async ({
  page,
}) => {
  const project = await seedProject('Empty')
  await openBoard(page, project.id)
  await openDialog(page)

  await dialog(page).getByRole('button', { name: 'Create task' }).click()

  const summary = dialog(page)
    .getByRole('heading', { name: 'Fix these fields' })
    .locator('..')
  await expect(summary).toBeFocused()
  const link = summary.getByRole('link', { name: 'Title: Title is required.' })
  await expect(link).toBeVisible()
  await expect(titleField(page)).toHaveAttribute('aria-invalid', 'true')
  await expect(titleField(page)).toHaveAccessibleDescription(
    'Title is required.',
  )

  await link.click()
  await expect(titleField(page)).toBeFocused()
})

test('a deleted project keeps the dialog open with a focused summary', async ({
  page,
}) => {
  const project = await seedProject('Deleted')
  await openBoard(page, project.id)
  await openDialog(page)

  await db.project.delete({ where: { id: project.id } })
  await titleField(page).fill('Write copy')
  await dialog(page).getByRole('button', { name: 'Create task' }).click()

  const summary = dialog(page)
    .getByRole('heading', { name: 'There is a problem' })
    .locator('..')
  await expect(summary).toBeFocused()
  await expect(summary).toContainText('Could not create the task. Try again.')
  await expect(dialog(page)).toBeVisible()
})

for (const theme of ['light', 'dark'] as const) {
  test(`the open dialog has no axe violations in the ${theme} theme`, async ({
    page,
  }) => {
    const project = await seedProject(`Axe ${theme}`)
    await page.addInitScript(
      ([key, value]) => localStorage.setItem(key, value),
      [THEME_STORAGE_KEY, theme],
    )
    await openBoard(page, project.id)

    await openDialog(page)
    await expectAccessible(page)

    // The error state too.
    await dialog(page).getByRole('button', { name: 'Create task' }).click()
    await expect(dialog(page).getByText('Fix these fields')).toBeVisible()
    await expectAccessible(page)
  })
}

test('dialog controls are at least 44 by 44 px', async ({ page }) => {
  const project = await seedProject('Targets')
  await openBoard(page, project.id)
  const trigger = await newTaskButton(page).boundingBox()
  expect(trigger?.height).toBeGreaterThanOrEqual(44)
  await openDialog(page)

  const targets = dialog(page).locator('button, input, select, textarea')
  for (const target of await targets.all()) {
    const box = await target.boundingBox()
    expect(
      box?.height,
      await target.evaluate((el) => el.outerHTML),
    ).toBeGreaterThanOrEqual(44)
    expect(box?.width).toBeGreaterThanOrEqual(44)
  }
})

// 320 CSS px wide is what a 1280 px window shows at 400% zoom; 320 by 480 is
// a short window too, where the form must scroll inside the dialog.
for (const size of [
  { width: 320, height: 640 },
  { width: 320, height: 480 },
]) {
  test(`the open dialog fits ${size.width} by ${size.height} px and scrolls inside`, async ({
    page,
  }) => {
    const project = await seedProject(`Reflow ${size.height}`)
    await page.setViewportSize(size)
    await openBoard(page, project.id)
    await openDialog(page)

    const submit = dialog(page).getByRole('button', { name: 'Create task' })
    await tabTo(page, submit)
    await expect(submit).toBeInViewport()

    const overflow = await page.evaluate(() => {
      const content = document.querySelector('[role="dialog"]')
      return {
        page:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
        dialogX: content ? content.scrollWidth - content.clientWidth : 0,
        dialogY: content ? content.scrollHeight - content.clientHeight : 0,
        scrolls: content ? getComputedStyle(content).overflowY : '',
        bottom: content ? content.getBoundingClientRect().bottom : 0,
        right: content ? content.getBoundingClientRect().right : 0,
      }
    })
    expect(overflow.page).toBeLessThanOrEqual(0)
    expect(overflow.dialogX).toBeLessThanOrEqual(0)
    expect(overflow.right).toBeLessThanOrEqual(size.width)
    expect(overflow.bottom).toBeLessThanOrEqual(size.height)
    expect(overflow.scrolls).toBe('auto')
    // The form is taller than the dialog here, so it scrolls inside it.
    expect(overflow.dialogY).toBeGreaterThan(0)
  })
}
