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
  return { name: `${label} ${run}${counter}`, key: `E${run}${counter}` }
}

const db = createTestPrismaClient()
const names: Array<string> = []

async function seedProject(label: string, data: { archivedAt?: Date } = {}) {
  const { name, key } = unique(label)
  names.push(name)
  return db.project.create({ data: { name, key, color: '#2563eb', ...data } })
}

test.afterAll(async () => {
  await db.project.deleteMany({ where: { name: { in: names } } })
  await db.$disconnect()
})

function sidebar(page: Page) {
  return page.getByRole('navigation', { name: 'Main' })
}

function newProjectButton(page: Page) {
  return sidebar(page).getByRole('button', { name: 'New project' })
}

function dialog(page: Page) {
  return page.getByRole('dialog', { name: 'New project' })
}

/** Waits for hydration, so clicks and key presses reach React. */
async function openApp(page: Page) {
  await page.goto('/', { waitUntil: 'networkidle' })
}

async function openDialog(page: Page) {
  await newProjectButton(page).click()
  await expect(dialog(page)).toBeVisible()
  // Axe and size checks need the final opacity and scale, not a frame of the
  // fade and zoom. A cancelled animation rejects, which is fine here.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  )
}

test('the server HTML lists projects in the sidebar', async ({ page }) => {
  const project = await seedProject('First paint')

  const response = await page.request.get('/')
  const html = await response.text()

  expect(html).toContain(`href="/projects/${project.id}"`)
  expect(html).toContain(project.name)
})

test('archived projects are not listed', async ({ page }) => {
  const live = await seedProject('Listed')
  const archived = await seedProject('Archived', { archivedAt: new Date() })

  await openApp(page)

  await expect(
    sidebar(page).getByRole('link', { name: live.name }),
  ).toBeVisible()
  await expect(
    sidebar(page).getByRole('link', { name: archived.name }),
  ).toHaveCount(0)
})

test('a project is created by keyboard alone', async ({ page }) => {
  const { name } = unique('Keyboard')
  names.push(name)
  await openApp(page)

  for (let i = 0; i < 50; i += 1) {
    await page.keyboard.press('Tab')
    if (
      await newProjectButton(page).evaluate(
        (el) => el === document.activeElement,
      )
    )
      break
  }
  await expect(newProjectButton(page)).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(dialog(page)).toBeVisible()

  const nameField = dialog(page).getByRole('textbox', {
    name: 'Name (required)',
  })
  await expect(nameField).toBeFocused()
  await page.keyboard.type(name)
  const suggested = name
    .split(' ')
    .map((word) => word[0])
    .join('')
    .toUpperCase()
  await expect(
    dialog(page).getByRole('textbox', { name: 'Key (required)' }),
  ).toHaveValue(suggested)

  // Keys are unique, so give this one a key no other run uses.
  await page.keyboard.press('Tab')
  const { key } = unique('Key')
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type(key)
  await page.keyboard.press('Enter')

  await expect(dialog(page)).toHaveCount(0)
  const link = sidebar(page).getByRole('link', { name })
  await expect(link).toBeFocused()
  await expect(link).toBeInViewport()
  await expect(page.locator('[aria-live="polite"]')).toHaveText(
    `Project ${name} created`,
  )

  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/projects\//)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name)
  await expect(page).toHaveTitle(`${name} · todoOverKill`)
  await expect(link).toHaveAttribute('aria-current', 'page')
  await expect(
    sidebar(page).getByRole('link', { name: 'Dashboard' }),
  ).not.toHaveAttribute('aria-current')
})

for (const theme of ['light', 'dark'] as const) {
  test(`the open dialog has no axe violations in the ${theme} theme`, async ({
    page,
  }) => {
    await seedProject(`Axe ${theme}`)
    await page.addInitScript(
      ([key, value]) => localStorage.setItem(key, value),
      [THEME_STORAGE_KEY, theme],
    )
    await openApp(page)
    await expectAccessible(page)

    await openDialog(page)
    await expectAccessible(page)

    // The error state too.
    await dialog(page).getByRole('button', { name: 'Create project' }).click()
    await expect(dialog(page).getByText('Fix these fields')).toBeVisible()
    await expectAccessible(page)
  })
}

test('an empty submit shows inline errors and a focused summary', async ({
  page,
}) => {
  await openApp(page)
  await openDialog(page)

  await dialog(page).getByRole('button', { name: 'Create project' }).click()

  const summary = dialog(page)
    .getByRole('heading', { name: 'Fix these fields' })
    .locator('..')
  await expect(summary).toBeFocused()
  const nameLink = summary.getByRole('link', {
    name: /^Name: Name is required/,
  })
  await expect(nameLink).toBeVisible()
  await expect(summary.getByRole('link', { name: /^Key:/ })).toBeVisible()

  const nameField = dialog(page).getByRole('textbox', {
    name: 'Name (required)',
  })
  await expect(nameField).toHaveAttribute('aria-invalid', 'true')
  await expect(nameField).toHaveAccessibleDescription('Name is required.')

  await nameLink.click()
  await expect(nameField).toBeFocused()
})

test('a taken key is shown on the key field', async ({ page }) => {
  const existing = await seedProject('Taken')
  const { name } = unique('Second')
  await openApp(page)
  await openDialog(page)

  await dialog(page)
    .getByRole('textbox', { name: 'Name (required)' })
    .fill(name)
  await dialog(page)
    .getByRole('textbox', { name: 'Key (required)' })
    .fill(existing.key)
  await dialog(page).getByRole('button', { name: 'Create project' }).click()

  const key = dialog(page).getByRole('textbox', { name: 'Key (required)' })
  await expect(key).toHaveAttribute('aria-invalid', 'true')
  await expect(key).toHaveAccessibleDescription(
    new RegExp(`Another project already uses the key ${existing.key}\\.`),
  )
  await expect(
    dialog(page)
      .getByRole('heading', { name: 'Fix these fields' })
      .locator('..'),
  ).toBeFocused()
})

test('Escape and Cancel return focus to the New project button', async ({
  page,
}) => {
  await openApp(page)

  await openDialog(page)
  await page.keyboard.press('Escape')
  await expect(dialog(page)).toHaveCount(0)
  await expect(newProjectButton(page)).toBeFocused()

  await openDialog(page)
  await dialog(page).getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog(page)).toHaveCount(0)
  await expect(newProjectButton(page)).toBeFocused()
})

test('dialog controls are at least 44 by 44 px', async ({ page }) => {
  await openApp(page)
  // Measured before opening: the open dialog hides the rest of the page.
  const trigger = await newProjectButton(page).boundingBox()
  expect(trigger?.height).toBeGreaterThanOrEqual(44)
  await openDialog(page)

  const targets = dialog(page).locator(
    'button, input:not([type=radio]), label:has(input[type=radio])',
  )
  await expect(targets.first()).toBeVisible()
  for (const target of await targets.all()) {
    const box = await target.boundingBox()
    expect(
      box?.height,
      await target.evaluate((el) => el.outerHTML),
    ).toBeGreaterThanOrEqual(44)
    expect(box?.width).toBeGreaterThanOrEqual(44)
  }
})

// 320 CSS px wide is what a 1280 px window shows at 400% zoom.
test('the open dialog reflows at 320 px without horizontal scrolling', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await openApp(page)
  await openDialog(page)
  await dialog(page).getByRole('button', { name: 'Create project' }).click()
  await expect(dialog(page).getByText('Fix these fields')).toBeVisible()

  const overflow = await page.evaluate(() => {
    const content = document.querySelector('[role="dialog"]')
    return {
      page:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      dialog: content ? content.scrollWidth - content.clientWidth : 0,
      right: content ? content.getBoundingClientRect().right : 0,
    }
  })
  expect(overflow.page).toBeLessThanOrEqual(0)
  expect(overflow.dialog).toBeLessThanOrEqual(0)
  expect(overflow.right).toBeLessThanOrEqual(320)
})
