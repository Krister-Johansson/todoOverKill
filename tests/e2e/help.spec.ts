import { expect, test } from '@playwright/test'

import { THEME_STORAGE_KEY } from '../../src/lib/theme'
import { createTestPrismaClient } from '../../src/test/db.ts'
import { expectAccessible } from './accessibility'

import type { Page } from '@playwright/test'

// Project names stay clear of "Help", "Settings" and "Dashboard", so the
// sidebar's links by those names stay unique.
const db = createTestPrismaClient()
const run = Math.random().toString(36).slice(2, 6).toUpperCase()
const project = { name: `Sidebar order ${run}`, key: `S${run}` }

test.afterAll(async () => {
  await db.project.deleteMany({ where: { name: project.name } })
  await db.$disconnect()
})

function mainNav(page: Page) {
  return page.getByRole('navigation', { name: 'Main' })
}

function contents(page: Page) {
  return page.getByRole('navigation', { name: 'On this page' })
}

test('Help is the last link of the main navigation on every page (3.2.6)', async ({
  page,
}) => {
  const { id: projectId } = await db.project.create({
    data: { ...project, color: '#2563eb' },
  })

  for (const path of ['/', `/projects/${projectId}`, '/settings', '/help']) {
    await page.goto(path)

    const links = mainNav(page).getByRole('link')
    const names = await links.allInnerTexts()
    expect(
      names.slice(-3).map((name) => name.trim()),
      path,
    ).toEqual(['Dashboard', 'Settings', 'Help'])
    await expect(links.last(), path).toHaveAttribute('href', '/help')
  }

  await expect(
    mainNav(page).getByRole('link', { name: 'Help', exact: true }),
  ).toHaveAttribute('aria-current', 'page')
})

const sections = [
  { link: 'Glossary', id: 'glossary' },
  { link: 'Keyboard shortcuts', id: 'shortcuts' },
  { link: 'Browser support', id: 'browsers' },
]

for (const { link, id } of sections) {
  test(`the keyboard reaches the ${link} section from the skip link`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 480 })
    await page.goto('/help', { waitUntil: 'networkidle' })

    await page.keyboard.press('Tab')
    await expect(
      page.getByRole('link', { name: 'Skip to content' }),
    ).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('main', { name: 'Content' })).toBeFocused()

    // Tab until the contents link has focus, rather than assuming it is the
    // next stop after main.
    const target = contents(page).getByRole('link', { name: link })
    for (let presses = 0; presses < 10; presses += 1) {
      if (
        await target.evaluate((element) => element === document.activeElement)
      )
        break
      await page.keyboard.press('Tab')
    }
    await expect(target).toBeFocused()

    await page.keyboard.press('Enter')

    const section = page.locator(`section#${id}`)
    await expect(section).toBeFocused()
    await expect(page).toHaveURL(new RegExp(`/help#${id}$`))
    await expect(
      section.getByRole('heading', { level: 2, name: link }),
    ).toBeInViewport()
    if (id === 'browsers') {
      // The page is taller than the viewport, so the last section needs a
      // scroll to come into view.
      expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
    }
  })
}

test('Tab continues from the section the contents link jumped to', async ({
  page,
}) => {
  await page.goto('/help', { waitUntil: 'networkidle' })

  await contents(page).getByRole('link', { name: 'Keyboard shortcuts' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('section#shortcuts')).toBeFocused()

  await page.keyboard.press('Tab')
  await expect(
    page
      .getByRole('region', { name: 'Keyboard shortcuts' })
      .getByRole('link', { name: 'Settings' }),
  ).toBeFocused()
})

test('the shortcuts table has a caption and key caps', async ({ page }) => {
  await page.goto('/help')

  const table = page.getByRole('table', { name: 'Keys and what they do' })
  await expect(table).toBeVisible()
  await expect(table.locator('caption')).toBeVisible()
  await expect(table.locator('kbd[data-slot="kbd"]').first()).toBeVisible()
  await expect(
    table.getByText('Not available yet. Arrives in a later release.'),
  ).toHaveCount(2)
})

// A 1280 px wide window at 400% zoom lays out at 320 CSS px, so this one
// check covers 1.4.10 at 320 px and at 400% zoom.
test('the Help page reflows at 320 px without horizontal scrolling', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await page.goto('/help')

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Help')
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
  // The table container scrolls on its own, which the check above misses.
  const tableOverflow = await page
    .locator('[data-slot="table-container"]')
    .evaluate((element) => element.scrollWidth - element.clientWidth)
  expect(tableOverflow).toBeLessThanOrEqual(0)
})

for (const theme of ['light', 'dark']) {
  test(`the Help page has no axe violations in the ${theme} theme`, async ({
    page,
  }) => {
    await page.addInitScript(
      ([key, value]) => localStorage.setItem(key, value),
      [THEME_STORAGE_KEY, theme],
    )
    await page.goto('/help', { waitUntil: 'networkidle' })

    if (theme === 'dark') {
      await expect(page.locator('html')).toHaveClass(/\bdark\b/)
    } else {
      await expect(page.locator('html')).not.toHaveClass(/\bdark\b/)
    }
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Help')
    await expectAccessible(page)
  })
}
