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
  return { name: `${label} ${run}${counter}`, key: `C${run}${counter}` }
}

const db = createTestPrismaClient()
const names: Array<string> = []

// One unbroken word, so the 320 px check covers a body that has to break.
const LONG_WORD = `Check${'thelayout'.repeat(15)}`

/** A project with one task and the given comments, oldest first. */
async function seedTask(label: string, comments: Array<string>) {
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
  const start = Date.now() - 60 * 60 * 1000
  const task = await db.task.create({
    data: {
      projectId: project.id,
      statusId: project.statuses[0].id,
      number: 1,
      title: 'Plan the release',
      order: 1,
      comments: {
        create: comments.map((body, index) => {
          const at = new Date(start + index * 60 * 1000)
          return { body, createdAt: at, updatedAt: at }
        }),
      },
    },
    include: { comments: { orderBy: { createdAt: 'asc' } } },
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
  return page.getByRole('region', { name: 'Comments' })
}

function liveRegion(page: Page) {
  return page.locator('[aria-live="polite"]')
}

function comment(page: Page, position: number) {
  return section(page).getByRole('article', {
    name: `Comment ${position}`,
    exact: true,
  })
}

function newComment(page: Page) {
  return section(page).getByRole('textbox', { name: 'New comment' })
}

function editComment(page: Page) {
  return section(page).getByRole('textbox', { name: 'Edit comment' })
}

function activitySentences(page: Page) {
  return page
    .getByRole('region', { name: 'Activity' })
    .getByRole('listitem')
    .locator('p')
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

async function expectTarget(locator: ReturnType<Page['locator']>) {
  const box = await locator.boundingBox()
  expect(box!.width).toBeGreaterThanOrEqual(44)
  expect(box!.height).toBeGreaterThanOrEqual(44)
}

test('add, edit and delete with the keyboard alone', async ({ page }) => {
  const { task } = await seedTask('Keyboard', ['The first note'])
  await openTask(page, task.id)

  // Add: type, Tab to the button, press Enter; focus moves to the comment.
  await newComment(page).focus()
  await page.keyboard.type('Ship it **today**')
  await page.keyboard.press('Tab')
  await expect(
    section(page).getByRole('button', { name: 'Add comment' }),
  ).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(liveRegion(page)).toHaveText('Comment added')
  await expect(comment(page, 2)).toBeFocused()
  await expect(comment(page, 2).locator('strong')).toHaveText('today')
  await expect(newComment(page)).toHaveValue('')

  // Edit: Escape cancels, Save keeps the new body; focus returns to Edit.
  const edit = section(page).getByRole('button', { name: 'Edit Comment 2' })
  await page.keyboard.press('Tab')
  await expect(edit).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(editComment(page)).toBeFocused()
  await expect(editComment(page)).toHaveValue('Ship it **today**')
  await page.keyboard.press('Escape')
  await expect(edit).toBeFocused()
  await page.keyboard.press('Enter')
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type('Ship it tomorrow')
  await page.keyboard.press('Tab')
  await expect(
    section(page).getByRole('button', { name: 'Save', exact: true }),
  ).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(liveRegion(page)).toHaveText('Comment edited')
  await expect(edit).toBeFocused()
  await expect(comment(page, 2)).toContainText('Ship it tomorrow')
  await expect(comment(page, 2).locator('time').locator('..')).toHaveText(
    /, edited$/,
  )

  // Delete: Escape keeps the comment and returns focus to Delete.
  const remove = section(page).getByRole('button', {
    name: 'Delete Comment 1',
  })
  await remove.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('alertdialog', {
    name: 'Delete this comment?',
  })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(remove).toBeFocused()

  // Confirming moves focus to the comment now in its place.
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('button', { name: 'Delete' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(liveRegion(page)).toHaveText('Comment deleted')
  await expect(dialog).toHaveCount(0)
  await expect(section(page).getByRole('article')).toHaveCount(1)
  await expect(comment(page, 1)).toBeFocused()
  await expect(comment(page, 1)).toContainText('Ship it tomorrow')

  // The last comment gone, focus is in the New comment field.
  await section(page).getByRole('button', { name: 'Delete Comment 1' }).focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')
  await expect(section(page)).toContainText('No comments yet')
  await expect(newComment(page)).toBeFocused()

  await expect(activitySentences(page)).toContainText([
    'Added a comment.',
    'Edited a comment.',
    'Deleted a comment.',
  ])
  expect(await notReloaded(page)).toBe(true)
})

test('changes survive a reload', async ({ page }) => {
  const { task } = await seedTask('Reload', ['Keep me', 'Remove me'])
  await openTask(page, task.id)

  await newComment(page).fill('Added later')
  await section(page).getByRole('button', { name: 'Add comment' }).click()
  await expect(liveRegion(page)).toHaveText('Comment added')
  await section(page).getByRole('button', { name: 'Edit Comment 1' }).click()
  await editComment(page).fill('Kept and edited')
  await section(page).getByRole('button', { name: 'Save' }).click()
  await expect(liveRegion(page)).toHaveText('Comment edited')
  await section(page).getByRole('button', { name: 'Delete Comment 2' }).click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Delete' })
    .click()
  await expect(liveRegion(page)).toHaveText('Comment deleted')

  await page.reload({ waitUntil: 'networkidle' })
  await expect(section(page).getByRole('article')).toHaveCount(2)
  await expect(comment(page, 1)).toContainText('Kept and edited')
  await expect(comment(page, 1)).toContainText(', edited')
  await expect(comment(page, 2)).toContainText('Added later')
})

test('an edit of a comment deleted elsewhere is announced', async ({
  page,
}) => {
  const { task } = await seedTask('Gone', ['Stays', 'Goes'])
  await openTask(page, task.id)
  await section(page).getByRole('button', { name: 'Edit Comment 2' }).click()
  await db.comment.delete({ where: { id: task.comments[1].id } })

  await editComment(page).fill('Too late')
  await editComment(page).press('Tab')
  await page.keyboard.press('Enter')

  await expect(liveRegion(page)).toHaveText(
    'Could not edit the comment. Try again.',
  )
  // The refetch after the failure drops the comment; focus stays on the page.
  await expect(section(page).getByRole('article')).toHaveCount(1)
  await expect(comment(page, 1)).toBeFocused()
})

test('an empty comment is refused in a focused summary', async ({ page }) => {
  const { task } = await seedTask('Empty', [])
  await openTask(page, task.id)

  await newComment(page).fill('   ')
  await section(page).getByRole('button', { name: 'Add comment' }).click()

  const summary = section(page).locator('[tabindex="-1"]', {
    has: page.getByRole('heading', { name: 'Fix these fields' }),
  })
  await expect(summary).toBeFocused()
  await expect(liveRegion(page)).toHaveText('Comment is required.')
  await expect(newComment(page)).toHaveAttribute('aria-invalid', 'true')
  await expect(newComment(page)).toHaveAccessibleDescription(
    'Comment is required.',
  )
  await summary
    .getByRole('link', { name: 'New comment: Comment is required.' })
    .press('Enter')
  await expect(newComment(page)).toBeFocused()
})

test('raw HTML is text and unsafe links are dropped', async ({ page }) => {
  const { task } = await seedTask('Unsafe', [
    // The script stands alone, as an HTML block; the links are a paragraph.
    '<script>window.hacked = true</script>\n\n<b>raw</b> [bad](javascript:alert(1)) [good](https://example.com)',
  ])
  await openTask(page, task.id)

  const body = comment(page, 1)
  await expect(body).toContainText('<script>window.hacked = true</script>')
  await expect(body.locator('script, b')).toHaveCount(0)
  await expect(body.getByRole('link', { name: 'bad' })).toHaveCount(0)
  await expect(body.getByRole('link', { name: 'good' })).toHaveAttribute(
    'href',
    'https://example.com',
  )
  expect(
    await page.evaluate(() => (window as { hacked?: boolean }).hacked),
  ).toBeUndefined()
  // Lines are capped under 80 characters: the prose box is narrower than 80
  // zeros in its own font.
  const fits = await body
    .locator('[class*="max-w-prose"]')
    .first()
    .evaluate((element) => {
      const probe = document.createElement('span')
      probe.textContent = '0'.repeat(80)
      probe.style.whiteSpace = 'nowrap'
      probe.style.position = 'absolute'
      element.append(probe)
      const eighty = probe.getBoundingClientRect().width
      probe.remove()
      return parseFloat(getComputedStyle(element).maxWidth) < eighty
    })
  expect(fits).toBe(true)
})

test('every button is at least 44 by 44 px', async ({ page }) => {
  const { task } = await seedTask('Targets', ['A', 'B'])
  await openTask(page, task.id)

  const buttons = await section(page).getByRole('button').all()
  expect(buttons.length).toBe(2 * 2 + 1)
  for (const target of buttons) await expectTarget(target)

  await section(page).getByRole('button', { name: 'Edit Comment 1' }).click()
  for (const name of ['Save', 'Cancel']) {
    await expectTarget(section(page).getByRole('button', { name, exact: true }))
  }

  await section(page).getByRole('button', { name: 'Delete Comment 2' }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toBeVisible()
  await settle(page)
  for (const name of ['Cancel', 'Delete']) {
    await expectTarget(dialog.getByRole('button', { name, exact: true }))
  }
})

for (const theme of ['light', 'dark'] as const) {
  test(`the task page with comments has no axe violations in the ${theme} theme`, async ({
    page,
  }) => {
    const { task } = await seedTask(`Axe ${theme}`, [
      'A plain comment',
      '## A heading\n\n- a list\n- with `code`\n\n[a link](https://example.com)',
    ])
    await page.addInitScript(
      ([key, value]) => localStorage.setItem(key, value),
      [THEME_STORAGE_KEY, theme],
    )
    await openTask(page, task.id)
    await expectAccessible(page)

    // The edit form with an error in its summary.
    await section(page).getByRole('button', { name: 'Edit Comment 1' }).click()
    await editComment(page).fill('')
    await section(page).getByRole('button', { name: 'Save' }).click()
    await expect(section(page)).toContainText('Fix these fields')
    await expectAccessible(page)
    await section(page).getByRole('button', { name: 'Cancel' }).click()

    // The delete dialog.
    await section(page)
      .getByRole('button', { name: 'Delete Comment 2' })
      .click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await settle(page)
    await expectAccessible(page)
  })
}

test('at 320 px the page does not scroll sideways', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  const { task } = await seedTask('Narrow', [`A ${LONG_WORD} word`, 'Short'])
  await openTask(page, task.id)

  await expect(comment(page, 1)).toContainText(LONG_WORD)
  const scrolls = () =>
    page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    )
  expect(await scrolls()).toBe(false)

  await section(page).getByRole('button', { name: 'Edit Comment 1' }).click()
  await expect(editComment(page)).toBeVisible()
  expect(await scrolls()).toBe(false)
  await expectAccessible(page)
})
