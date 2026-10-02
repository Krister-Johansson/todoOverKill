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
 * A server tool call for the first reply, streamed as chat() streams one:
 * TOOL_CALL_START, TOOL_CALL_ARGS and TOOL_CALL_END, then TOOL_CALL_RESULT
 * with the result as JSON. A failure is sent as chat() sends a thrown
 * ToolError: `{ "error": message }` marked output-error in
 * `metadata.tanstack.state`. With `hold`, the stream stops after
 * TOOL_CALL_END, as while a tool runs, until the fetch is aborted.
 */
type MockToolCall = {
  name: string
  args: object
  result?: object
  error?: string
  hold?: boolean
}

/**
 * Replaces fetch for /api/chat with a stream of AG-UI events, one word every
 * `delayMs`, so no request leaves the browser and the placeholder key is never
 * used. With `toolCall`, the first reply calls that tool before its text.
 * Requests are counted in `window.__chatRequests` and their bodies kept in
 * `window.__chatBodies`, an aborted fetch is counted in
 * `window.__chatAborts`, and the request's Content-Type, which the route
 * requires to be JSON, is kept in `window.__chatContentType`.
 */
async function mockChatStream(
  page: Page,
  {
    text,
    delayMs,
    toolCall,
  }: { text: string; delayMs: number; toolCall?: MockToolCall },
) {
  await page.addInitScript(
    // Runs in the page, so it takes its values as an argument.
    // eslint-disable-next-line no-shadow
    ({ text, delayMs, toolCall }) => {
      const state = window as unknown as {
        __chatRequests: number
        __chatAborts: number
        __chatContentType: string | null
        __chatBodies: Array<unknown>
      }
      state.__chatRequests = 0
      state.__chatAborts = 0
      state.__chatContentType = null
      state.__chatBodies = []
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
        state.__chatRequests += 1
        state.__chatContentType = new Headers(init?.headers).get('content-type')
        const signal =
          init?.signal ?? (input instanceof Request ? input.signal : undefined)
        const body = JSON.parse(
          typeof init?.body === 'string' ? init.body : '{}',
        )
        state.__chatBodies.push(body)
        const threadId = body.threadId ?? 'thread'
        const runId = body.runId ?? 'run'
        const messageId = `reply-${runId}`
        const toolCallId = `call-${runId}`
        const timestamp = Date.now()
        const words = text.split(/(?<= )/)
        const call = state.__chatRequests === 1 ? toolCall : undefined
        const toolEvents: Array<object> = call
          ? [
              {
                type: 'TOOL_CALL_START',
                toolCallId,
                toolCallName: call.name,
                parentMessageId: messageId,
                timestamp,
              },
              {
                type: 'TOOL_CALL_ARGS',
                toolCallId,
                delta: JSON.stringify(call.args),
                timestamp,
              },
              { type: 'TOOL_CALL_END', toolCallId, timestamp },
              {
                type: 'TOOL_CALL_RESULT',
                messageId,
                toolCallId,
                role: 'tool',
                content: JSON.stringify(
                  call.error === undefined
                    ? (call.result ?? {})
                    : { error: call.error },
                ),
                ...(call.error === undefined
                  ? {}
                  : { metadata: { tanstack: { state: 'output-error' } } }),
                timestamp,
              },
            ]
          : []
        // Where a held stream stops: after TOOL_CALL_END.
        const holdAt = call?.hold ? 4 : -1
        const events: Array<object | '[DONE]'> = [
          { type: 'RUN_STARTED', threadId, runId, timestamp },
          ...toolEvents,
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
              if (index === holdAt) return
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
    { text, delayMs, toolCall },
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
  // A server without the key shows the disabled panel, and every test below
  // would fail for a reason that is not the code's.
  await assistantButton(page).click()
  await expect(
    panel(page).getByText('The assistant is off.'),
    'The e2e server has no OPENROUTER_API_KEY. tests/e2e/serve.ts sets a placeholder for vite build and vite preview; check that it still does.',
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
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __chatContentType: string | null })
          .__chatContentType,
    ),
  ).toBe('application/json')
})

test('the conversation survives closing and opening the panel', async ({
  page,
}) => {
  await assistantButton(page).click()
  await messageField(page).fill('First question')
  await page.keyboard.press('Enter')
  const items = conversation(page).getByRole('listitem')
  await expect(items.nth(1)).toContainText(REPLY)

  await page.keyboard.press('Escape')
  await expect(panel(page)).toHaveCount(0)
  await page.keyboard.press('a')
  await expect(items).toHaveCount(2)
  await expect(items.first()).toContainText('First question')
  await expect(items.nth(1)).toContainText(REPLY)
  await expect(panel(page)).not.toContainText('No messages yet')

  // A reply still streaming when the panel closes runs on and is listed when
  // the panel opens again.
  await messageField(page).fill('Second question')
  await page.keyboard.press('Enter')
  await expect(panel(page).getByRole('button', { name: 'Stop' })).toBeVisible()
  await messageField(page).press('Escape')
  await expect(panel(page)).toHaveCount(0)
  await assistantButton(page).click()
  await expect(items).toHaveCount(4)
  await expect(items.nth(2)).toContainText('Second question')
  await expect(items.nth(3)).toContainText(REPLY)
  expect(
    await page.evaluate(
      () => (window as unknown as { __chatAborts: number }).__chatAborts,
    ),
  ).toBe(0)
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

test('a message over 20,000 characters is not sent', async ({ page }) => {
  await assistantButton(page).click()
  const long = 'x'.repeat(20_001)
  await messageField(page).fill(long)
  await page.keyboard.press('Enter')

  const error = 'Messages can be up to 20,000 characters.'
  await expect(panel(page).getByText(error)).toBeVisible()
  await expect(liveRegion(page)).toHaveText(error)
  await expect(messageField(page)).toHaveValue(long)
  await expect(messageField(page)).toBeFocused()
  await expect(conversation(page).getByRole('listitem')).toHaveCount(0)
  expect(
    await page.evaluate(
      () => (window as unknown as { __chatRequests: number }).__chatRequests,
    ),
  ).toBe(0)
  await settle(page)
  await expectAccessible(page)

  // The next edit clears the error.
  await page.keyboard.press('Backspace')
  await expect(panel(page).getByText(error)).toHaveCount(0)
})

test('Clear conversation empties the list and keeps focus', async ({
  page,
}) => {
  await assistantButton(page).click()
  await messageField(page).fill('How do tasks work?')
  await page.keyboard.press('Enter')
  const items = conversation(page).getByRole('listitem')
  await expect(items.nth(1)).toContainText(REPLY)

  const clear = panel(page).getByRole('button', { name: 'Clear conversation' })
  await clear.click()
  await expect(items).toHaveCount(0)
  await expect(panel(page)).toContainText('No messages yet')
  await expect(liveRegion(page)).toHaveText('Conversation cleared')
  await expect(clear).toBeFocused()
  await expect(clear).toHaveAttribute('aria-disabled', 'true')
})

const TASKS_REPLY = 'Website has two tasks: Fix login and Ship.'

const LIST_TASKS: MockToolCall = {
  name: 'list_tasks',
  args: { projectId: 'p1' },
  result: {
    tasks: [
      { number: 1, title: 'Fix login' },
      { number: 2, title: 'Ship' },
    ],
  },
}

function toolCard(page: Page, name: string) {
  return conversation(page).getByRole('group', { name: `Tool call: ${name}` })
}

/** Reloads with a mock whose first reply calls `toolCall`, and asks. */
async function askWithToolCall(
  page: Page,
  toolCall: MockToolCall,
  delayMs = 40,
) {
  await mockChatStream(page, { text: TASKS_REPLY, delayMs, toolCall })
  await page.reload({ waitUntil: 'networkidle' })
  await assistantButton(page).click()
  await messageField(page).fill('Which tasks does Website have?')
  await page.keyboard.press('Enter')
}

for (const theme of ['light', 'dark'] as const) {
  test(`a reply that calls list_tasks shows the tool card (${theme})`, async ({
    page,
  }) => {
    await page.addInitScript(
      ([key, value]) => localStorage.setItem(key, value),
      [THEME_STORAGE_KEY, theme],
    )
    await askWithToolCall(page, LIST_TASKS)

    const reply = conversation(page).getByRole('listitem').nth(1)
    await expect(reply).toContainText(TASKS_REPLY)
    const card = toolCard(page, 'List tasks')
    await expect(card).toHaveText('List tasksDone2 tasks')
    // The card comes before the text, and is inside the reply.
    await expect(reply).toContainText(`List tasksDone2 tasks${TASKS_REPLY}`)
    await expect(liveRegion(page)).toHaveText(`Assistant: ${TASKS_REPLY}`)
    await settle(page)
    await expectAccessible(page)
  })
}

test('a failed tool call shows Failed and the error', async ({ page }) => {
  await askWithToolCall(page, {
    name: 'list_tasks',
    args: { projectId: 'nope' },
    error: 'No project with id nope.',
  })

  const card = toolCard(page, 'List tasks')
  await expect(card).toContainText('Failed')
  await expect(card).toContainText('No project with id nope.')
  await expect(card).not.toContainText('Done')
  await expect(conversation(page).getByRole('listitem').nth(1)).toContainText(
    TASKS_REPLY,
  )
  await settle(page)
  await expectAccessible(page)
})

test('a follow-up sends the tool call and its result back', async ({
  page,
}) => {
  await askWithToolCall(page, LIST_TASKS)
  const items = conversation(page).getByRole('listitem')
  await expect(items.nth(1)).toContainText(TASKS_REPLY)

  await messageField(page).fill('And which is due first?')
  await page.keyboard.press('Enter')
  await expect(items.nth(3)).toContainText(TASKS_REPLY)
  await expect(items).toHaveCount(4)

  const bodies = await page.evaluate(
    () =>
      (
        window as unknown as {
          __chatBodies: Array<{ messages: Array<Record<string, unknown>> }>
        }
      ).__chatBodies,
  )
  expect(bodies).toHaveLength(2)
  const sent = bodies[1].messages
  const call = sent.find(
    (message) => message.role === 'assistant' && message.toolCalls,
  )
  expect(call?.toolCalls).toEqual([
    expect.objectContaining({
      id: expect.any(String),
      function: expect.objectContaining({ name: 'list_tasks' }),
    }),
  ])
  const callId = (call?.toolCalls as Array<{ id: string }>)[0].id
  expect(sent).toContainEqual(
    expect.objectContaining({
      role: 'tool',
      toolCallId: callId,
      content: JSON.stringify(LIST_TASKS.result),
    }),
  )
  expect(sent.at(-1)).toMatchObject({
    role: 'user',
    content: 'And which is due first?',
  })
})

test('Stop while a tool runs shows Stopped and sends no unanswered call', async ({
  page,
}) => {
  await askWithToolCall(page, { ...LIST_TASKS, hold: true })
  const card = toolCard(page, 'List tasks')
  await expect(card).toHaveText('List tasksRunning')

  await panel(page).getByRole('button', { name: 'Stop' }).click()
  await expect(card).toHaveText('List tasksStopped')
  await expect(liveRegion(page)).toHaveText('Reply stopped')

  // The next request leaves the stopped call out, as the model provider
  // refuses a tool call with no result.
  await messageField(page).fill('Try again')
  await page.keyboard.press('Enter')
  await expect(conversation(page).getByRole('listitem').nth(3)).toContainText(
    TASKS_REPLY,
  )
  const sent = await page.evaluate(
    () =>
      (
        window as unknown as {
          __chatBodies: Array<{ messages: Array<Record<string, unknown>> }>
        }
      ).__chatBodies[1].messages,
  )
  expect(sent.some((message) => message.toolCalls)).toBe(false)
  expect(sent.some((message) => message.role === 'tool')).toBe(false)
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

test('Escape in the filter Text field clears it while the panel is open', async ({
  page,
}) => {
  const project = await seedProject('Assistant')
  await page.goto(`/projects/${project.id}/board`, { waitUntil: 'networkidle' })
  await assistantButton(page).click()
  await expect(panel(page)).toBeVisible()

  const text = page
    .getByRole('form', { name: 'Filter tasks' })
    .getByRole('searchbox', { name: 'Text' })
  await text.fill('login')
  await text.press('Escape')
  await expect(text).toHaveValue('')
  await expect(text).toBeFocused()
  await expect(panel(page)).toBeVisible()
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
