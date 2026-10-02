import { expect, test } from '@playwright/test'

import { THEME_STORAGE_KEY } from '../../src/lib/theme'
import { createTestPrismaClient } from '../../src/test/db.ts'
import { expectAccessible } from './accessibility'

import type { Page } from '@playwright/test'

// Tests run in parallel against one database, and keys are unique, so every
// project here gets its own name and key.
const run = Math.random().toString(36).slice(2, 6).toUpperCase()
let counter = 0

const db = createTestPrismaClient()
const names: Array<string> = []

/** An empty project with one status. */
async function seedProject(label: string) {
  counter += 1
  const name = `${label} ${run}${counter}`
  names.push(name)
  return db.project.create({
    data: {
      name,
      key: `P${run}${counter}`,
      color: '#2563eb',
      statuses: { create: [{ name: 'Backlog', order: 1, category: 'todo' }] },
    },
  })
}

test.afterAll(async () => {
  await db.project.deleteMany({ where: { name: { in: names } } })
  await db.$disconnect()
})

function searchButton(page: Page) {
  return page.getByRole('banner').getByRole('button', { name: 'Search' })
}

function palette(page: Page) {
  return page.getByRole('dialog', { name: 'Command menu' })
}

function combobox(page: Page) {
  return palette(page).getByRole('combobox', { name: 'Search' })
}

function main(page: Page) {
  return page.getByRole('main', { name: 'Content' })
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

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.addInitScript(
    ([key, value]) => localStorage.setItem(key, value),
    [THEME_STORAGE_KEY, theme],
  )
}

/** Records whether the last keydown reached window with its default prevented. */
async function watchDefault(page: Page) {
  await page.evaluate(() => {
    window.addEventListener('keydown', (event) => {
      ;(window as unknown as { prevented: boolean }).prevented =
        event.defaultPrevented
    })
  })
}

function lastPrevented(page: Page) {
  return page.evaluate(
    () => (window as unknown as { prevented?: boolean }).prevented,
  )
}

test('the keyboard alone opens the palette, filters and goes to a page', async ({
  page,
}) => {
  await page.goto('/', { waitUntil: 'networkidle' })

  for (let i = 0; i < 30; i += 1) {
    await page.keyboard.press('Tab')
    if (
      await searchButton(page).evaluate((el) => el === document.activeElement)
    )
      break
  }
  await expect(searchButton(page)).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(combobox(page)).toBeFocused()

  await page.keyboard.type('help')
  await expect(palette(page).getByRole('option')).toHaveText(['Go to Help'])
  await expect(palette(page).locator('[aria-live="polite"]')).toHaveText(
    '1 option',
  )
  await page.keyboard.press('Enter')

  await expect(page).toHaveURL(/\/help$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Help')
  await expect(main(page)).toBeFocused()
})

test('the combobox points at its listbox and the active option', async ({
  page,
}) => {
  await page.goto('/', { waitUntil: 'networkidle' })
  await searchButton(page).click()

  const input = combobox(page)
  await expect(input).toHaveAttribute('aria-expanded', 'true')
  const listbox = palette(page).getByRole('listbox', { name: 'Actions' })
  await expect(input).toHaveAttribute(
    'aria-controls',
    (await listbox.getAttribute('id'))!,
  )
  await page.keyboard.press('ArrowDown')
  const active = palette(page).getByRole('option', { selected: true })
  await expect(active).toHaveText('Go to Settings')
  await expect(input).toHaveAttribute(
    'aria-activedescendant',
    (await active.getAttribute('id'))!,
  )

  await page.keyboard.type('no such action')
  await expect(palette(page).getByText('No results')).toBeVisible()
  await expect(palette(page).locator('[aria-live="polite"]')).toHaveText(
    'No results',
  )
  await expect(input).toHaveAttribute('aria-expanded', 'false')
})

for (const key of ['Control+k', 'Meta+k']) {
  test(`${key} opens the palette from the board and from a field`, async ({
    page,
  }) => {
    const project = await seedProject('Shortcut')
    await page.goto(`/projects/${project.id}/board`, {
      waitUntil: 'networkidle',
    })
    await watchDefault(page)

    await page.keyboard.press(key)
    await expect(combobox(page)).toBeFocused()
    expect(await lastPrevented(page)).toBe(true)
    await page.keyboard.press('Escape')
    await expect(palette(page)).toHaveCount(0)
    // Opened from the page body, so focus goes to the Search button. Wait for
    // it: Radix moves focus a task after the palette unmounts.
    await expect(searchButton(page)).toBeFocused()

    // A select is a field where single-key shortcuts stay off.
    const status = page
      .getByRole('form', { name: 'Filter tasks' })
      .getByRole('combobox', { name: 'Status' })
    await status.focus()
    await page.keyboard.press(key)
    await expect(combobox(page)).toBeFocused()
    expect(await lastPrevented(page)).toBe(true)
    // The next letter lands in the palette, not in the field.
    await page.keyboard.type('b')
    await expect(combobox(page)).toHaveValue('b')

    await page.keyboard.press('Escape')
    await expect(status).toBeFocused()
  })
}

test('Control+k inside the open palette neither closes it nor opens another', async ({
  page,
}) => {
  await page.goto('/', { waitUntil: 'networkidle' })
  await page.keyboard.press('Control+k')
  await page.keyboard.type('set')

  await page.keyboard.press('Control+k')
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await expect(combobox(page)).toBeFocused()
  await expect(combobox(page)).toHaveValue('set')
})

test('Go to a project reaches its board', async ({ page }) => {
  const project = await seedProject('Target')
  await page.goto('/settings', { waitUntil: 'networkidle' })

  await page.keyboard.press('Control+k')
  await page.keyboard.type(project.name)
  await expect(palette(page).getByRole('option')).toHaveText([
    `Go to ${project.name}`,
  ])
  await page.keyboard.press('Enter')

  await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/board$`))
  await expect(main(page)).toBeFocused()
})

test('New task opens the create dialog on a project page', async ({ page }) => {
  const project = await seedProject('New task')
  await page.goto(`/projects/${project.id}/board`, { waitUntil: 'networkidle' })

  await searchButton(page).click()
  await page.keyboard.type('new task')
  await page.keyboard.press('Enter')

  const dialog = page.getByRole('dialog', { name: 'New task' })
  await expect(
    dialog.getByRole('textbox', { name: 'Title (required)' }),
  ).toBeFocused()
  await expect(palette(page)).toHaveCount(0)

  await page.keyboard.press('Escape')
  await expect(
    page.getByRole('banner').getByRole('button', { name: 'New task' }),
  ).toBeFocused()
})

test('Switch theme flips the theme and announces it', async ({ page }) => {
  await setTheme(page, 'light')
  await page.goto('/', { waitUntil: 'networkidle' })

  await searchButton(page).click()
  await page.keyboard.type('theme')
  await expect(palette(page).getByRole('option')).toHaveText([
    'Switch to dark theme',
  ])
  await page.keyboard.press('Enter')

  await expect(page.locator('html')).toHaveClass(/\bdark\b/)
  await expect(searchButton(page)).toBeFocused()
  const region = page.locator('[aria-live="polite"]')
  await expect(region).toHaveCount(1)
  await expect(region).toHaveText('Theme set to Dark')
})

test('a double-click on Switch theme switches it once', async ({ page }) => {
  await setTheme(page, 'light')
  await page.goto('/', { waitUntil: 'networkidle' })

  await searchButton(page).click()
  await palette(page)
    .getByRole('option', { name: 'Switch to dark theme' })
    .dblclick()

  await expect(palette(page)).toHaveCount(0)
  await expect(page.locator('[aria-live="polite"]')).toHaveText(
    'Theme set to Dark',
  )
  await expect(page.locator('html')).toHaveClass(/\bdark\b/)
  await expect(searchButton(page)).toBeFocused()
})

test('Control+k in the New task dialog keeps focus in it', async ({ page }) => {
  const project = await seedProject('Inside a dialog')
  await page.goto(`/projects/${project.id}/board`, { waitUntil: 'networkidle' })
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'New task' })
    .click()
  const title = page
    .getByRole('dialog', { name: 'New task' })
    .getByRole('textbox', { name: 'Title (required)' })
  await expect(title).toBeFocused()

  const prevented = await title.evaluate((field) => {
    const event = new KeyboardEvent('keydown', {
      key: 'k',
      code: 'KeyK',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    field.dispatchEvent(event)
    return event.defaultPrevented
  })
  expect(prevented).toBe(true)
  await page.keyboard.press('Control+k')
  await expect(palette(page)).toHaveCount(0)
  await expect(title).toBeFocused()
})

test('Escape returns focus to the element that opened the palette', async ({
  page,
}) => {
  await page.goto('/', { waitUntil: 'networkidle' })

  await searchButton(page).click()
  await page.keyboard.press('Escape')
  await expect(palette(page)).toHaveCount(0)
  await expect(searchButton(page)).toBeFocused()

  const help = page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Help' })
  await help.focus()
  await page.keyboard.press('Control+k')
  await expect(combobox(page)).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(help).toBeFocused()
})

test('the palette is gone as soon as it closes, with no exit animation', async ({
  page,
}) => {
  await page.goto('/', { waitUntil: 'networkidle' })
  await page.keyboard.press('Control+k')
  await settle(page)

  // The closed state sets no animation, so Radix unmounts the content at once
  // rather than on animationend.
  const closedAnimation = await palette(page).evaluate((dialog) => {
    dialog.setAttribute('data-state', 'closed')
    const name = getComputedStyle(dialog).animationName
    dialog.setAttribute('data-state', 'open')
    return name
  })
  expect(closedAnimation).toBe('none')

  await page.keyboard.press('Escape')
  // Read straight away, with no retry that could wait out an animation.
  expect(
    await page.evaluate(
      () => document.querySelectorAll('[role="dialog"]').length,
    ),
  ).toBe(0)
  await expect(searchButton(page)).toBeFocused()

  // Control+k straight after Escape opens it again; a closing palette would
  // still count as an open dialog and swallow the chord.
  await page.keyboard.press('Control+k')
  await expect(combobox(page)).toBeFocused()
  await expect(combobox(page)).toHaveValue('')
})

test('the pointer moves the active option, so Enter runs that one', async ({
  page,
}) => {
  await page.goto('/', { waitUntil: 'networkidle' })
  await searchButton(page).click()
  await settle(page)

  const help = palette(page).getByRole('option', { name: 'Go to Help' })
  await help.hover()
  await expect(help).toHaveAttribute('aria-selected', 'true')
  await expect(palette(page).locator('[aria-selected="true"]')).toHaveCount(1)
  await expect(combobox(page)).toHaveAttribute(
    'aria-activedescendant',
    (await help.getAttribute('id'))!,
  )

  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/help$/)
  await expect(main(page)).toBeFocused()
})

test('Control+k opens the palette with single-key shortcuts off', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem('todoOverKill.shortcuts', 'off'),
  )
  await page.goto('/', { waitUntil: 'networkidle' })

  await page.keyboard.press('Control+k')
  await expect(combobox(page)).toBeFocused()
})

test('every option is at least 44 px tall', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' })
  await searchButton(page).click()
  await settle(page)

  const heights = await palette(page)
    .getByRole('option')
    .evaluateAll((options) =>
      options.map((option) => option.getBoundingClientRect().height),
    )
  expect(heights.length).toBeGreaterThan(0)
  for (const height of heights) expect(height).toBeGreaterThanOrEqual(44)
})

for (const theme of ['light', 'dark'] as const) {
  test(`the open palette has no axe violations in the ${theme} theme`, async ({
    page,
  }) => {
    await setTheme(page, theme)
    await page.goto('/', { waitUntil: 'networkidle' })

    await searchButton(page).click()
    await settle(page)
    await expectAccessible(page)

    await page.keyboard.type('no such action')
    await expect(palette(page).getByText('No results')).toBeVisible()
    await expectAccessible(page)
  })
}

// A 1280 px wide window at 400% zoom lays out at 320 CSS px.
for (const height of [640, 480]) {
  test(`the palette reflows at 320 by ${height} px`, async ({ page }) => {
    // Enough options that the list has to scroll on a short screen.
    for (let i = 0; i < 4; i += 1) await seedProject('Reflow')
    await page.setViewportSize({ width: 320, height })
    await page.goto('/', { waitUntil: 'networkidle' })

    await searchButton(page).click()
    await settle(page)

    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
    const dialogOverflow = await palette(page).evaluate(
      (element) => element.scrollWidth - element.clientWidth,
    )
    expect(dialogOverflow).toBeLessThanOrEqual(0)

    const listbox = palette(page).getByRole('listbox', { name: 'Actions' })
    const list = await listbox.evaluate((element) => ({
      horizontal: element.scrollWidth - element.clientWidth,
      vertical: element.scrollHeight - element.clientHeight,
    }))
    expect(list.horizontal).toBeLessThanOrEqual(0)
    expect(list.vertical).toBeGreaterThan(0)

    // The active option scrolls into view inside the list.
    await page.keyboard.press('End')
    await expect(
      palette(page).getByRole('option', { selected: true }),
    ).toBeInViewport()
  })
}
