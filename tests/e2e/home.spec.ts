import { expect, test } from '@playwright/test'

import { expectAccessible } from './accessibility'

test('the home page loads and has no axe violations', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveTitle('todoOverKill')
  // The page has no content yet, so main has no size and is not visible.
  await expect(page.getByRole('main')).toBeAttached()
  await expectAccessible(page)
})
