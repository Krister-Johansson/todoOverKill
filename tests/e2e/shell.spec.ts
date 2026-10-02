import { expect, test } from '@playwright/test'

import { THEME_STORAGE_KEY } from '../../src/lib/theme'
import { expectAccessible } from './accessibility'

import type { Page } from '@playwright/test'

function breadcrumbCurrent(page: Page) {
  return page
    .getByRole('navigation', { name: 'Breadcrumb' })
    .locator('[aria-current="page"]')
}

test('Tab reaches the skip link first and it moves focus to main', async ({
  page,
}) => {
  await page.goto('/')

  await page.keyboard.press('Tab')
  const skipLink = page.getByRole('link', { name: 'Skip to content' })
  await expect(skipLink).toBeFocused()
  await expect(skipLink).toBeInViewport()

  await page.keyboard.press('Enter')
  await expect(page.getByRole('main', { name: 'Content' })).toBeFocused()
})

test('the shell has labelled landmarks and a polite live region', async ({
  page,
}) => {
  await page.goto('/')

  await expect(page).toHaveTitle('Dashboard · todoOverKill')
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
  await expect(
    page.getByRole('navigation', { name: 'Breadcrumb' }),
  ).toBeVisible()
  await expect(page.getByRole('banner')).toBeVisible()
  // The Search button opens the command palette (F65); the palette's own
  // live region exists only while it is open.
  await expect(
    page.getByRole('banner').getByRole('button', { name: 'Search' }),
  ).toBeVisible()
  await expect(page.getByRole('main', { name: 'Content' })).toBeVisible()
  await expect(page.locator('[aria-live="polite"]')).toHaveCount(1)

  await expect(
    page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Dashboard' }),
  ).toHaveAttribute('aria-current', 'page')
  await expect(breadcrumbCurrent(page)).toHaveText('Dashboard')

  const firstHeading = page.getByRole('heading').first()
  await expect(firstHeading).toHaveText('Dashboard')
  expect(await firstHeading.evaluate((element) => element.tagName)).toBe('H1')

  await expectAccessible(page)
})

for (const name of ['Settings', 'Help']) {
  test(`the ${name} page updates the breadcrumb and current link`, async ({
    page,
  }) => {
    await page.goto(`/${name.toLowerCase()}`)

    await expect(page).toHaveTitle(`${name} · todoOverKill`)
    await expect(breadcrumbCurrent(page)).toHaveText(name)
    const nav = page.getByRole('navigation', { name: 'Main' })
    await expect(nav.getByRole('link', { name })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(
      nav.getByRole('link', { name: 'Dashboard' }),
    ).not.toHaveAttribute('aria-current')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(name)

    await expectAccessible(page)
  })
}

test('the shell has no axe violations in the dark theme', async ({ page }) => {
  await page.addInitScript((key) => {
    localStorage.setItem(key, 'dark')
  }, THEME_STORAGE_KEY)
  // Waiting for the client bundle lets hydration finish, so the check below
  // fails if hydration drops the class.
  await page.goto('/', { waitUntil: 'networkidle' })

  await expect(page.locator('html')).toHaveClass(/\bdark\b/)
  await expect(page.getByRole('main', { name: 'Content' })).toBeVisible()
  await expectAccessible(page)
})

test('the shell reflows at 320 px without horizontal scrolling', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await page.goto('/')

  await expect(page.getByRole('main', { name: 'Content' })).toBeVisible()
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
})
