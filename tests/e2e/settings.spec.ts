import { expect, test } from '@playwright/test'

import { PREFERENCES } from '../../src/lib/preferences'
import { THEME_STORAGE_KEY } from '../../src/lib/theme'
import { expectAccessible } from './accessibility'

import type { Page } from '@playwright/test'

const voiceNote = 'Not available yet. Voice arrives in a later release.'

function shortcutsSwitch(page: Page) {
  return page.getByRole('switch', { name: 'Single-key shortcuts' })
}

function stored(page: Page, key: string) {
  return page.evaluate((name) => localStorage.getItem(name), key)
}

test('single-key shortcuts turn off by keyboard and stay off after reload', async ({
  page,
}) => {
  await page.goto('/settings', { waitUntil: 'networkidle' })

  const followSystem = page.getByRole('radio', {
    name: 'Follow system',
    exact: true,
  })
  await expect(followSystem).toBeChecked()
  await followSystem.focus()
  await page.keyboard.press('Tab')

  const shortcuts = shortcutsSwitch(page)
  await expect(shortcuts).toBeFocused()
  await expect(shortcuts).toBeChecked()

  await page.keyboard.press('Space')

  await expect(shortcuts).toBeChecked({ checked: false })
  await expect(page.locator('[aria-live="polite"]')).toHaveText(
    'Single-key shortcuts turned off',
  )
  expect(await stored(page, PREFERENCES.shortcuts.key)).toBe('off')

  await page.reload({ waitUntil: 'networkidle' })

  // The server renders the default (on); the stored value replaces it after
  // hydration, so wait for the state rather than reading it once.
  await expect(shortcuts).toBeChecked({ checked: false })
  expect(await stored(page, PREFERENCES.shortcuts.key)).toBe('off')
})

test('the voice switches are disabled and say why', async ({ page }) => {
  await page.goto('/settings', { waitUntil: 'networkidle' })

  for (const name of ['Send when I stop speaking', 'Read replies aloud']) {
    const control = page.getByRole('switch', { name })
    await expect(control).toBeVisible()
    await expect(control).toBeDisabled()
    await expect(control).toBeChecked({ checked: false })
    await expect(control).toHaveAccessibleDescription(new RegExp(voiceNote))
  }
  await expect(page.getByText(voiceNote)).toHaveCount(2)
  for (const note of await page.getByText(voiceNote).all()) {
    await expect(note).toBeVisible()
  }
})

test('every radio and switch has a visible label', async ({ page }) => {
  await page.goto('/settings', { waitUntil: 'networkidle' })

  const controls = page.locator(
    'main input[type="radio"], main [role="switch"]',
  )
  await expect(controls).toHaveCount(9)
  for (const control of await controls.all()) {
    const label = await control.evaluate((element) => {
      const labels = (element as HTMLInputElement | HTMLButtonElement).labels
      const first = labels?.[0]
      if (!first) return null
      const box = first.getBoundingClientRect()
      return {
        text: first.textContent.trim(),
        visible: box.width > 0 && box.height > 0,
      }
    })
    expect(label?.text).toBeTruthy()
    expect(label?.visible).toBe(true)
  }
})

test('each switch is at least 44 by 44 px', async ({ page }) => {
  await page.goto('/settings', { waitUntil: 'networkidle' })

  for (const control of await page.getByRole('switch').all()) {
    const box = await control.boundingBox()
    expect(box?.width).toBeGreaterThanOrEqual(44)
    expect(box?.height).toBeGreaterThanOrEqual(44)
  }
})

for (const theme of ['light', 'dark']) {
  test(`the Settings page with shortcuts off has no axe violations in the ${theme} theme`, async ({
    page,
  }) => {
    await page.addInitScript(
      ([key, value]) => localStorage.setItem(key, value),
      [THEME_STORAGE_KEY, theme],
    )
    await page.goto('/settings', { waitUntil: 'networkidle' })
    await expect(
      page.getByRole('radio', {
        name: theme === 'dark' ? 'Dark' : 'Light',
        exact: true,
      }),
    ).toBeChecked()

    await shortcutsSwitch(page).click()
    await expect(shortcutsSwitch(page)).toBeChecked({ checked: false })

    await expectAccessible(page)
  })
}
