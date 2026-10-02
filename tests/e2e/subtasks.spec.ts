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
  return { name: `${label} ${run}${counter}`, key: `S${run}${counter}` }
}

const db = createTestPrismaClient()
const names: Array<string> = []

// One unbroken word, so the 320 px check covers a title that has to break.
const LONG_TITLE = `Check${'thelayout'.repeat(15)}`

/** A project with one task and the given subtasks, top to bottom. */
async function seedTask(
  label: string,
  subtasks: Array<{ title: string; done?: boolean }>,
) {
  const { name, key } = unique(label)
  names.push(name)
  const project = await db.project.create({
    data: {
      name,
      key,
      color: '#2563eb',
      nextTaskNumber: 2,
      statuses: { create: [{ name: 'Backlog', order: 1, category: 'todo' }] },
    },
    include: { statuses: true },
  })
  const task = await db.task.create({
    data: {
      projectId: project.id,
      statusId: project.statuses[0].id,
      number: 1,
      title: 'Plan the release',
      order: 1,
      subtasks: {
        create: subtasks.map((subtask, index) => ({
          title: subtask.title,
          done: subtask.done ?? false,
          order: index + 1,
        })),
      },
    },
    include: { subtasks: { orderBy: { order: 'asc' } } },
  })
  return { project, task }
}

test.afterAll(async () => {
  // Tasks first: a status with tasks cannot be deleted.
  await db.task.deleteMany({ where: { project: { name: { in: names } } } })
  await db.project.deleteMany({ where: { name: { in: names } } })
  await db.$disconnect()
})

/** Waits for hydration, then marks the window so a reload would show. */
async function openTask(page: Page, taskId: string) {
  await page.goto(`/tasks/${taskId}`, { waitUntil: 'networkidle' })
  await page.evaluate(() => {
    ;(window as { noReload?: boolean }).noReload = true
  })
}

async function notReloaded(page: Page) {
  return page.evaluate(() => (window as { noReload?: boolean }).noReload)
}

function section(page: Page) {
  return page.getByRole('region', { name: 'Subtasks' })
}

function liveRegion(page: Page) {
  return page.locator('[aria-live="polite"]')
}

function checkbox(page: Page, title: string) {
  return section(page).getByRole('checkbox', { name: title, exact: true })
}

function newSubtask(page: Page) {
  return section(page).getByRole('textbox', { name: 'New subtask' })
}

function activitySentences(page: Page) {
  return page
    .getByRole('region', { name: 'Activity' })
    .getByRole('listitem')
    .locator('p')
}

test('add, toggle, rename and delete with the keyboard alone', async ({
  page,
}) => {
  const { task } = await seedTask('Keyboard', [{ title: 'Write notes' }])
  await openTask(page, task.id)
  await expect(section(page)).toContainText('0 of 1 done')

  // Add: Enter submits and focus stays in the input.
  await newSubtask(page).focus()
  await page.keyboard.type('Tag the build')
  await page.keyboard.press('Enter')
  await expect(liveRegion(page)).toHaveText('Subtask Tag the build added')
  await expect(checkbox(page, 'Tag the build')).toBeVisible()
  await expect(newSubtask(page)).toBeFocused()
  await expect(newSubtask(page)).toHaveValue('')
  await expect(section(page)).toContainText('0 of 2 done')

  // Toggle: Tab back to the new row's checkbox and press Space.
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Shift+Tab')
  await expect(checkbox(page, 'Tag the build')).toBeFocused()
  await page.keyboard.press('Space')
  await expect(checkbox(page, 'Tag the build')).toBeChecked()
  await expect(liveRegion(page)).toHaveText('Subtask Tag the build done')
  await expect(section(page)).toContainText('1 of 2 done')
  await page.keyboard.press('Space')
  await expect(liveRegion(page)).toHaveText('Subtask Tag the build not done')
  await expect(checkbox(page, 'Tag the build')).not.toBeChecked()
  await page.keyboard.press('Space')
  await expect(liveRegion(page)).toHaveText('Subtask Tag the build done')

  // Rename: Edit opens a Title field; Escape cancels, Enter saves.
  const edit = section(page).getByRole('button', {
    name: 'Edit Write notes',
  })
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Shift+Tab')
  await expect(edit).toBeFocused()
  await page.keyboard.press('Enter')
  const title = section(page).getByRole('textbox', { name: 'Title' })
  await expect(title).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(edit).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(title).toBeFocused()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.type('Write release notes')
  await page.keyboard.press('Enter')
  await expect(liveRegion(page)).toHaveText(
    'Subtask renamed to Write release notes',
  )
  await expect(
    section(page).getByRole('button', { name: 'Edit Write release notes' }),
  ).toBeFocused()

  // Delete: focus moves to the next row's checkbox.
  await page.keyboard.press('Tab')
  await expect(
    section(page).getByRole('button', { name: 'Delete Write release notes' }),
  ).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(liveRegion(page)).toHaveText(
    'Subtask Write release notes deleted',
  )
  await expect(checkbox(page, 'Tag the build')).toBeFocused()
  await expect(section(page)).toContainText('1 of 1 done')

  // Deleting the last row moves focus to the New subtask input.
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await expect(
    section(page).getByRole('button', { name: 'Delete Tag the build' }),
  ).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(liveRegion(page)).toHaveText('Subtask Tag the build deleted')
  await expect(newSubtask(page)).toBeFocused()
  await expect(section(page)).toContainText('No subtasks yet')

  // Every change was saved without a reload.
  expect(await notReloaded(page)).toBe(true)
  await expect(activitySentences(page)).toHaveText([
    'Added the subtask “Tag the build”.',
    'Completed the subtask “Tag the build”.',
    'Reopened the subtask “Tag the build”.',
    'Completed the subtask “Tag the build”.',
    'Changed the title of the subtask “Write release notes”.',
    'Deleted the subtask “Write release notes”.',
    'Deleted the subtask “Tag the build”.',
  ])
})

test('changes survive a reload', async ({ page }) => {
  const { task } = await seedTask('Reload', [
    { title: 'First step' },
    { title: 'Second step' },
  ])
  await openTask(page, task.id)

  await checkbox(page, 'First step').click()
  await expect(liveRegion(page)).toHaveText('Subtask First step done')
  await newSubtask(page).fill('Third step')
  await newSubtask(page).press('Enter')
  await expect(liveRegion(page)).toHaveText('Subtask Third step added')
  await section(page)
    .getByRole('button', { name: 'Delete Second step' })
    .click()
  await expect(liveRegion(page)).toHaveText('Subtask Second step deleted')

  await page.reload({ waitUntil: 'networkidle' })
  await expect(section(page).getByRole('checkbox')).toHaveCount(2)
  await expect(checkbox(page, 'First step')).toBeChecked()
  await expect(checkbox(page, 'Third step')).not.toBeChecked()
  await expect(section(page)).toContainText('1 of 2 done')
})

test('a refused toggle rolls back and is announced', async ({ page }) => {
  const { task } = await seedTask('Refused', [{ title: 'Hold me' }])
  await openTask(page, task.id)

  // Hold the write, so the optimistic state can be seen, then refuse it.
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/_serverFn/**', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    await held
    return route.fulfill({ status: 500, body: 'Refused' })
  })

  await checkbox(page, 'Hold me').focus()
  await page.keyboard.press('Space')
  await expect(checkbox(page, 'Hold me')).toBeChecked()
  release()
  await expect(liveRegion(page)).toHaveText(
    'Could not save subtask Hold me. Try again.',
  )
  await expect(checkbox(page, 'Hold me')).not.toBeChecked()
  await expect(checkbox(page, 'Hold me')).toBeFocused()
  await expect(section(page)).toContainText('0 of 1 done')
})

test('a toggle of a subtask deleted elsewhere is announced', async ({
  page,
}) => {
  const { task } = await seedTask('Gone', [
    { title: 'Stays' },
    { title: 'Goes' },
  ])
  await openTask(page, task.id)
  await db.subtask.delete({ where: { id: task.subtasks[1].id } })

  await checkbox(page, 'Goes').click()

  await expect(liveRegion(page)).toHaveText(
    'Could not save subtask Goes. Try again.',
  )
  // The refetch after the failure drops the row the server no longer has.
  await expect(checkbox(page, 'Goes')).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Plan the release',
  )
})

test('an empty title is refused with a message', async ({ page }) => {
  const { task } = await seedTask('Empty', [])
  await openTask(page, task.id)

  await newSubtask(page).focus()
  await page.keyboard.press('Enter')

  await expect(newSubtask(page)).toHaveAttribute('aria-invalid', 'true')
  await expect(newSubtask(page)).toHaveAccessibleDescription(
    'Title is required.',
  )
  await expect(newSubtask(page)).toBeFocused()
})

test('checkboxes and buttons are at least 44 by 44 px', async ({ page }) => {
  const { task } = await seedTask('Targets', [
    { title: 'A' },
    { title: 'B', done: true },
  ])
  await openTask(page, task.id)

  const targets = [
    ...(await section(page).getByRole('checkbox').all()),
    ...(await section(page).getByRole('button').all()),
  ]
  expect(targets.length).toBe(2 + 2 * 2 + 1)
  for (const target of targets) {
    const box = await target.boundingBox()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
  }

  await section(page).getByRole('button', { name: 'Edit A' }).click()
  for (const name of ['Save', 'Cancel']) {
    const box = await section(page)
      .getByRole('button', { name, exact: true })
      .boundingBox()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
  }
})

for (const theme of ['light', 'dark'] as const) {
  test(`the task page with subtasks has no axe violations in the ${theme} theme`, async ({
    page,
  }) => {
    const { task } = await seedTask(`Axe ${theme}`, [
      { title: 'Not done yet' },
      { title: 'Already done', done: true },
    ])
    await page.addInitScript(
      ([key, value]) => localStorage.setItem(key, value),
      [THEME_STORAGE_KEY, theme],
    )
    await openTask(page, task.id)
    await expectAccessible(page)

    // The rename form and an error message.
    await section(page)
      .getByRole('button', { name: 'Edit Not done yet' })
      .click()
    await newSubtask(page).focus()
    await page.keyboard.press('Enter')
    await expect(section(page)).toContainText('Title is required.')
    await expectAccessible(page)
  })
}

test('at 320 px the page does not scroll sideways', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  const { task } = await seedTask('Narrow', [
    { title: LONG_TITLE },
    { title: 'Short', done: true },
  ])
  await openTask(page, task.id)

  await expect(checkbox(page, LONG_TITLE)).toBeVisible()
  const scrolls = () =>
    page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    )
  expect(await scrolls()).toBe(false)

  await section(page)
    .getByRole('button', { name: `Edit ${LONG_TITLE}` })
    .click()
  await expect(
    section(page).getByRole('textbox', { name: 'Title' }),
  ).toBeVisible()
  expect(await scrolls()).toBe(false)
  await expectAccessible(page)
})
