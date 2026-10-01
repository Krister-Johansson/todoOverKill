import { expect, test } from '@playwright/test'

import { expectAccessible } from './accessibility'

test('expectAccessible fails a page with a violation', async ({ page }) => {
  await page.setContent(
    [
      '<!doctype html>',
      '<html lang="en">',
      '<head><title>Violation</title></head>',
      '<body><main><img src="x.png"></main></body>',
      '</html>',
    ].join(''),
  )

  await expect(expectAccessible(page)).rejects.toThrow(/image-alt/)
})
