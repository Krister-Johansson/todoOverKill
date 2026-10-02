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

async function seedProject(label: string) {
  counter += 1
  const name = `${label} ${run}${counter}`
  names.push(name)
  return db.project.create({
    data: {
      name,
      key: `A${run}${counter}`,
      color: '#2563eb',
      statuses: { create: [{ name: 'Backlog', order: 1, category: 'todo' }] },
    },
  })
}

test.afterAll(async () => {
  await db.project.deleteMany({ where: { name: { in: names } } })
  await db.$disconnect()
})

/**
 * Replaces fetch for /api/chat with a stream of AG-UI events, one word every
 * `delayMs`, so no request leaves the browser and the placeholder key is never
 * used. An aborted fetch is counted in `window.__chatAborts`.
 */
async function mockChatStream(
  page: Page,
  { text, delayMs }: { text: string; delayMs: number },
) {
  await page.addInitScript(
    // Runs in the page, so it takes its values as an argument.
    // eslint-disable-next-line no-shadow
    ({ text, delayMs }) => {
      const state = window as unknown as { __chatAborts: number }
      state.__chatAborts = 0
      const realFetch = window.fetch.bind(window)
      window.fetch = (input, init) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.href
              : input.url
        if (!new URL(url, location.href).pathname.startsWith('/api/chat')) {
          return realFetch(input, init)
        }
        const signal =
          init?.signal ?? (input instanceof Request ? input.signal : undefined)
        const body = JSON.parse(
          typeof init?.body === 'string' ? init.body : '{}',
        )
        const threadId = body.threadId ?? 'thread'
        const runId = body.runId ?? 'run'
        const messageId = `reply-${runId}`
        const timestamp = Date.now()
        const words = text.split(/(?<= )/)
        const events: Array<object | '[DONE]'> = [
          { type: 'RUN_STARTED', threadId, runId, timestamp },
          {
            type: 'TEXT_MESSAGE_START',
            messageId,
            role: 'assistant',
            timestamp,
          },
          ...words.map((delta) => ({
            type: 'TEXT_MESSAGE_CONTENT',
            messageId,
            delta,
            timestamp,
          })),
          { type: 'TEXT_MESSAGE_END', messageId, timestamp },
          {
            type: 'RUN_FINISHED',
            threadId,
            runId,
            finishReason: 'stop',
            timestamp,
          },
          '[DONE]',
        ]
        const encoder = new TextEncoder()
        let timer: number | undefined
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            let index = 0
            const next = () => {
              const event = events[index]
              index += 1
              controller.enqueue(
                encoder.encode(
                  `data: ${event === '[DONE]' ? event : JSON.stringify(event)}\n\n`,
                ),
              )
              if (index < events.length)
                timer = window.setTimeout(next, delayMs)
              else controller.close()
            }
            next()
            signal?.addEventListener('abort', () => {
              state.__chatAborts += 1
              window.clearTimeout(timer)
              controller.error(new DOMException('Aborted', 'AbortError'))
            })
          },
        })
        return Promise.resolve(
          new Response(stream, {
            headers: { 'content-type': 'text/event-stream' },
          }),
        )
      }
    },
    { text, delayMs },
  )
}

function assistantButton(page: Page) {
  return page.getByRole('banner').getByRole('button', { name: 'Assistant' })
}

function panel(page: Page) {
  return page.getByRole('dialog', { name: 'Assistant' })
}

function messageField(page: Page) {
  return panel(page).getByRole('textbox', { name: 'Message' })
}

function conversation(page: Page) {
  return panel(page).getByRole('list', { name: 'Conversation' })
}

function liveRegion(page: Page) {
  return page.locator('div[aria-live="polite"][aria-atomic="true"]')
}

/** Waits for the slide animation, so axe and size checks see the last frame. */
async function settle(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  )
}

const REPLY = 'Tasks live in projects. Open a project to see its board.'

test.beforeEach(async ({ page }) => {
  await mockChatStream(page, { text: REPLY, delayMs: 40 })
  await page.goto('/', { waitUntil: 'networkidle' })
  // A reused dev server without the key shows the disabled panel, and every
  // test below would fail for a reason that is not the code's.
  await assistantButton(page).click()
  await expect(
    panel(page).getByText('The assistant is off.'),
    'The server on port 3100 has no OPENROUTER_API_KEY. Stop the reused server, or export the variable, and run again.',
  ).toHaveCount(0)
  await panel(page).getByRole('button', { name: 'Close' }).click()
  await expect(panel(page)).toHaveCount(0)
})

test('the Assistant button and a open the panel', async ({ page }) => {
  await assistantButton(page).click()
  await expect(assistantButton(page)).toHaveAttribute('aria-expanded', 'true')
  await expect(
    panel(page).getByRole('heading', { level: 2, name: 'Assistant' }),
  ).toBeVisible()
  await expect(messageField(page)).toBeFocused()
  await expect(panel(page).getByRole('button', { name: 'Send' })).toBeVisible()
  await expect(conversation(page)).toBeAttached()

  await page.keyboard.press('Escape')
  await expect(panel(page)).toHaveCount(0)
  await expect(assistantButton(page)).toBeFocused()

  // `a` does nothing while typing in a field, and opens the panel otherwise.
  await page.keyboard.press('a')
  await expect(messageField(page)).toBeFocused()
  await page.keyboard.press('a')
  await expect(messageField(page)).toHaveValue('a')
})

test('a is off when single-key shortcuts are off', async ({ page }) => {
  await page.goto('/settings', { waitUntil: 'networkidle' })
  const shortcuts = page.getByRole('switch', { name: 'Single-key shortcuts' })
  await shortcuts.click()
  await expect(shortcuts).toHaveAttribute('aria-checked', 'false')
  await page.locator('body').click({ position: { x: 1, y: 1 } })
  await page.keyboard.press('a')
  await expect(panel(page)).toHaveCount(0)
})

test('a sent message appears and the reply streams in', async ({ page }) => {
  await assistantButton(page).click()
  await messageField(page).fill('How do tasks work?')
  await page.keyboard.press('Enter')

  const items = conversation(page).getByRole('listitem')
  await expect(items.first()).toContainText('You')
  await expect(items.first()).toContainText('How do tasks work?')
  await expect(items.nth(1)).toContainText('Assistant')
  await expect(items.nth(1)).toContainText(REPLY)
  await expect(panel(page).getByRole('button', { name: 'Stop' })).toHaveCount(0)
  await expect(messageField(page)).toBeFocused()
  await expect(liveRegion(page)).toHaveText(`Assistant: ${REPLY}`)
})

test('Stop ends a streaming reply', async ({ page }) => {
  await mockChatStream(page, { text: REPLY, delayMs: 400 })
  await page.reload({ waitUntil: 'networkidle' })
  await assistantButton(page).click()
  await messageField(page).fill('Tell me something long')
  await page.keyboard.press('Enter')

  const stop = panel(page).getByRole('button', { name: 'Stop' })
  await expect(stop).toBeVisible()
  const reply = conversation(page).getByRole('listitem').nth(1)
  await expect(reply).toContainText('Tasks')
  await stop.click()

  await expect(stop).toHaveCount(0)
  expect(
    await page.evaluate(
      () => (window as unknown as { __chatAborts: number }).__chatAborts,
    ),
  ).toBe(1)
  const textAtStop = await reply.textContent()
  await page.waitForTimeout(1000)
  expect(await reply.textContent()).toBe(textAtStop)
  expect(textAtStop).not.toContain('board.')
  await expect(messageField(page)).toBeFocused()
  await expect(liveRegion(page)).toHaveText('Reply stopped')
})

/**
 * Waits until Radix ranks a modal dialog above the panel. A new dismissable
 * layer becomes the top one, and takes Escape, a render after it appears;
 * until then the panel is still on top and ignores an Escape pressed outside
 * it. That render also sets the panel's own `pointer-events: none`, so this
 * waits for that inline style. A person cannot press Escape that fast, but
 * Playwright can. The modal hides the panel from the accessibility tree, so
 * the id finds it.
 */
async function waitForLayerAbovePanel(page: Page) {
  await expect(page.locator('#assistant-panel')).toHaveAttribute(
    'style',
    /pointer-events: none/,
  )
}

test('the page stays usable while the panel is open', async ({ page }) => {
  const project = await seedProject('Assistant')
  await page.goto(`/projects/${project.id}/board`, { waitUntil: 'networkidle' })
  await assistantButton(page).click()
  await expect(panel(page)).toBeVisible()

  // A click outside leaves the panel open, and Escape outside it does not
  // close it.
  await page.getByRole('main', { name: 'Content' }).click()
  await expect(panel(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(panel(page)).toBeVisible()

  // c and Ctrl+K still work beside it.
  await page.keyboard.press('c')
  const newTask = page.getByRole('dialog', { name: 'New task' })
  await expect(newTask).toBeVisible()
  await waitForLayerAbovePanel(page)
  await page.keyboard.press('Escape')
  await expect(newTask).toHaveCount(0)
  await expect(panel(page)).toBeVisible()

  await page.getByRole('main', { name: 'Content' }).focus()
  await page.keyboard.press('Control+k')
  const palette = page.getByRole('dialog', { name: 'Command menu' })
  await expect(palette).toBeVisible()
  await waitForLayerAbovePanel(page)
  await page.keyboard.press('Escape')
  await expect(palette).toHaveCount(0)
  await expect(panel(page)).toBeVisible()

  // Nothing in the content column is under the panel.
  const panelBox = await panel(page).boundingBox()
  const mainBox = await page
    .getByRole('main', { name: 'Content' })
    .boundingBox()
  expect(panelBox && mainBox).toBeTruthy()
  expect(mainBox!.x + mainBox!.width).toBeLessThanOrEqual(panelBox!.x + 1)
})

for (const theme of ['light', 'dark'] as const) {
  test(`the open panel has no axe violations in the ${theme} theme`, async ({
    page,
  }) => {
    await page.addInitScript(
      ([key, value]) => localStorage.setItem(key, value),
      [THEME_STORAGE_KEY, theme],
    )
    await page.reload({ waitUntil: 'networkidle' })
    await assistantButton(page).click()
    await messageField(page).fill('Hello')
    await page.keyboard.press('Enter')
    await expect(conversation(page).getByRole('listitem').nth(1)).toContainText(
      REPLY,
    )
    await settle(page)
    await expectAccessible(page)
  })
}

// A 1280 px wide window at 400% zoom lays out at 320 CSS px.
test.describe('at 320 px', () => {
  test.use({ viewport: { width: 320, height: 640 } })

  for (const how of ['Escape', 'Close'] as const) {
    test(`the panel fills the screen and ${how} returns focus`, async ({
      page,
    }) => {
      await assistantButton(page).click()
      await settle(page)
      await expect(messageField(page)).toBeFocused()

      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      )
      expect(overflow).toBeLessThanOrEqual(0)
      // The shell is hidden, so nothing focusable sits behind the panel.
      await expect(assistantButton(page)).toBeHidden()
      await expect(page.getByRole('main', { name: 'Content' })).toBeHidden()

      if (how === 'Escape') await page.keyboard.press('Escape')
      else await panel(page).getByRole('button', { name: 'Close' }).click()

      await expect(panel(page)).toHaveCount(0)
      await expect(assistantButton(page)).toBeVisible()
      await expect(assistantButton(page)).toBeFocused()
    })
  }
})
