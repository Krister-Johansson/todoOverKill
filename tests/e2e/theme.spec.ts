import { expect, test } from '@playwright/test'

import { MOTION_STORAGE_KEY } from '../../src/lib/motion'
import { THEME_STORAGE_KEY } from '../../src/lib/theme'
import { expectAccessible } from './accessibility'

import type { Page } from '@playwright/test'

declare global {
  interface Window {
    __darkAtBody: boolean | null
    __darkRemoved: boolean
    __motionRemoved: boolean
  }
}

/**
 * Records, from before the page's own html element exists, whether html had
 * the dark class when body was inserted and whether anything later removed
 * the class or data-motion="reduce". Runs on every navigation, reloads
 * included. It observes document because documentElement can still be null
 * when init scripts run.
 */
async function observeTheme(page: Page) {
  await page.addInitScript(() => {
    window.__darkAtBody = null
    window.__darkRemoved = false
    window.__motionRemoved = false
    const hasDark = (value: string | null) => /\bdark\b/.test(value ?? '')

    new MutationObserver((records) => {
      const html = document.documentElement
      // One callback can hold a removal and the re-add that followed it, so
      // the value after a record is the old value of the next record for the
      // same attribute, not the current value.
      function valueAfter(index: number, name: string) {
        const next = records
          .slice(index + 1)
          .find(
            (record) =>
              record.type === 'attributes' &&
              record.target === html &&
              record.attributeName === name,
          )
        return next ? next.oldValue : html.getAttribute(name)
      }

      records.forEach((record, index) => {
        if (record.type === 'childList') {
          for (const node of record.addedNodes) {
            if (node.nodeName === 'BODY') {
              window.__darkAtBody = hasDark(valueAfter(index, 'class'))
            }
          }
        } else if (record.target === html) {
          const after = valueAfter(index, record.attributeName ?? '')
          if (
            record.attributeName === 'class' &&
            hasDark(record.oldValue) &&
            !hasDark(after)
          ) {
            window.__darkRemoved = true
          }
          if (
            record.attributeName === 'data-motion' &&
            record.oldValue === 'reduce' &&
            after !== 'reduce'
          ) {
            window.__motionRemoved = true
          }
        }
      })
    }).observe(document, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ['class', 'data-motion'],
    })
  })
}

function seedStorage(page: Page, values: Record<string, string>) {
  return page.addInitScript((entries) => {
    for (const [key, value] of Object.entries(entries)) {
      localStorage.setItem(key, value)
    }
  }, values)
}

function flags(page: Page) {
  return page.evaluate(() => ({
    darkAtBody: window.__darkAtBody,
    darkRemoved: window.__darkRemoved,
    motionRemoved: window.__motionRemoved,
  }))
}

test('the init script is inside head in the server HTML', async ({ page }) => {
  const html = await (await page.request.get('/settings')).text()

  const script = html.indexOf('<script id="theme-init">')
  expect(script).toBeGreaterThan(html.indexOf('<head'))
  expect(script).toBeLessThan(html.indexOf('</head>'))
  expect(script).toBeLessThan(html.indexOf('<body'))
})

test('a stored theme and motion setting apply before paint and survive hydration', async ({
  page,
}) => {
  await observeTheme(page)
  await seedStorage(page, {
    [THEME_STORAGE_KEY]: 'dark',
    [MOTION_STORAGE_KEY]: 'reduce',
  })

  await page.goto('/settings', { waitUntil: 'networkidle' })

  // The server renders System and Follow system checked, so these are
  // checked only once the client has hydrated and rendered the stored values.
  await expect(
    page.getByRole('radio', { name: 'Dark', exact: true }),
  ).toBeChecked()
  await expect(
    page.getByRole('radio', { name: 'Reduce', exact: true }),
  ).toBeChecked()

  expect(await flags(page)).toEqual({
    darkAtBody: true,
    darkRemoved: false,
    motionRemoved: false,
  })
  const html = page.locator('html')
  await expect(html).toHaveClass(/\bdark\b/)
  await expect(html).toHaveAttribute('data-motion', 'reduce')
  await expect(page.locator('#theme-init')).toHaveCount(1)
})

test('the theme is chosen by keyboard and persists across reload', async ({
  page,
}) => {
  await observeTheme(page)
  await page.goto('/settings', { waitUntil: 'networkidle' })

  const system = page.getByRole('radio', { name: 'System', exact: true })
  await expect(system).toBeChecked()
  await system.focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')

  const dark = page.getByRole('radio', { name: 'Dark', exact: true })
  await expect(dark).toBeChecked()
  await expect(dark).toBeFocused()
  await expect(page.locator('html')).toHaveClass(/\bdark\b/)
  await expect(page.locator('[aria-live="polite"]')).toHaveText(
    'Theme set to Dark',
  )
  expect(
    await page.evaluate((key) => localStorage.getItem(key), THEME_STORAGE_KEY),
  ).toBe('dark')

  await page.reload({ waitUntil: 'networkidle' })

  await expect(dark).toBeChecked()
  await expect(page.locator('html')).toHaveClass(/\bdark\b/)
  expect(await flags(page)).toMatchObject({
    darkAtBody: true,
    darkRemoved: false,
  })
})

test('System follows the OS on a page without the switch', async ({ page }) => {
  await page.goto('/settings', { waitUntil: 'networkidle' })
  await page.getByRole('radio', { name: 'Light', exact: true }).check()
  await page.getByRole('radio', { name: 'System', exact: true }).check()

  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Dashboard' })
    .click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dashboard')

  const html = page.locator('html')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(html).toHaveClass(/\bdark\b/)

  await page.emulateMedia({ colorScheme: 'light' })
  await expect(html).not.toHaveClass(/\bdark\b/)
})

test('the motion override persists and collapses CSS transitions', async ({
  page,
}) => {
  function transitionSeconds() {
    return page
      .getByRole('main', { name: 'Content' })
      .evaluate((element) =>
        parseFloat(getComputedStyle(element).transitionDuration),
      )
  }

  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/settings', { waitUntil: 'networkidle' })
  const html = page.locator('html')
  expect(await transitionSeconds()).toBe(0)

  await page.getByRole('radio', { name: 'Reduce', exact: true }).check()
  await expect(html).toHaveAttribute('data-motion', 'reduce')
  await expect(page.locator('[aria-live="polite"]')).toHaveText(
    'Motion set to Reduce',
  )
  expect(await transitionSeconds()).toBeCloseTo(0.00001, 6)

  await page.reload({ waitUntil: 'networkidle' })
  await expect(
    page.getByRole('radio', { name: 'Reduce', exact: true }),
  ).toBeChecked()
  await expect(html).toHaveAttribute('data-motion', 'reduce')

  // Follow system leaves the attribute off; the media query does the work.
  await page.getByRole('radio', { name: 'Follow system', exact: true }).check()
  await expect(html).not.toHaveAttribute('data-motion')
  expect(await transitionSeconds()).toBe(0)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  expect(await transitionSeconds()).toBeCloseTo(0.00001, 6)

  // Allow overrides the OS.
  await page.getByRole('radio', { name: 'Allow', exact: true }).check()
  await expect(html).toHaveAttribute('data-motion', 'allow')
  expect(await transitionSeconds()).toBe(0)
})

for (const theme of ['light', 'dark']) {
  test(`the Settings page has no axe violations in the ${theme} theme`, async ({
    page,
  }) => {
    await seedStorage(page, { [THEME_STORAGE_KEY]: theme })
    await page.goto('/settings', { waitUntil: 'networkidle' })

    await expect(
      page.getByRole('radio', {
        name: theme === 'dark' ? 'Dark' : 'Light',
        exact: true,
      }),
    ).toBeChecked()
    await expect(page.getByRole('group', { name: 'Theme' })).toBeVisible()
    await expectAccessible(page)
  })
}

test('the Settings page reflows at 320 px without horizontal scrolling', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await page.goto('/settings')

  await expect(page.getByRole('group', { name: 'Motion' })).toBeVisible()
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
})
