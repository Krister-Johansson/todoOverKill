// @vitest-environment node
// Server code runs without `window`. Under jsdom, t3-env treats the module as
// client code and blocks every server variable.
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Route } from '#/routes/api/chat'
import { callRoute } from '#/test/rest'

import type * as TanStackAI from '@tanstack/ai'

const env = vi.hoisted(() => ({
  OPENROUTER_API_KEY: undefined as string | undefined,
  OPENROUTER_MODEL: 'openai/gpt-4o-mini',
}))

vi.mock('#/env', () => ({ env }))

// The adapter is a stand-in and chat() never calls it, so no test can reach
// OpenRouter, with or without a key.
const { createOpenRouterText, chat } = vi.hoisted(() => ({
  createOpenRouterText: vi.fn(() => ({ kind: 'text', name: 'stub' })),
  chat: vi.fn(),
}))

vi.mock('@tanstack/ai-openrouter', () => ({ createOpenRouterText }))
vi.mock('@tanstack/ai', async (importOriginal) => ({
  ...(await importOriginal<typeof TanStackAI>()),
  chat,
}))

const validBody = {
  threadId: 'thread-1',
  runId: 'run-1',
  state: {},
  messages: [{ id: 'message-1', role: 'user', content: 'Hello' }],
  tools: [],
  context: [],
  forwardedProps: {},
}

async function* reply() {
  yield {
    type: 'RUN_STARTED',
    threadId: 'thread-1',
    runId: 'run-1',
    timestamp: 0,
  }
  yield {
    type: 'RUN_FINISHED',
    threadId: 'thread-1',
    runId: 'run-1',
    timestamp: 0,
  }
}

beforeEach(() => {
  env.OPENROUTER_API_KEY = undefined
  createOpenRouterText.mockClear()
  chat.mockReset()
  chat.mockImplementation(() => reply())
})

describe('POST /api/chat', () => {
  it('returns 503 with the explanation when the key is missing', async () => {
    const { status, json } = await callRoute(Route, 'POST', {
      url: '/api/chat',
      body: validBody,
    })
    expect(status).toBe(503)
    expect(json).toEqual({
      error: {
        code: 'assistant_disabled',
        message:
          'The assistant is off. Set OPENROUTER_API_KEY in .env and restart the app.',
      },
    })
    expect(createOpenRouterText).not.toHaveBeenCalled()
    expect(chat).not.toHaveBeenCalled()
  })

  it('refuses a body that is not application/json with 415', async () => {
    // A cross-site page can send text/plain without a CORS preflight.
    env.OPENROUTER_API_KEY = 'test-key'
    const { status, json } = await callRoute(Route, 'POST', {
      url: '/api/chat',
      body: JSON.stringify(validBody),
      contentType: 'text/plain',
    })
    expect(status).toBe(415)
    expect(json).toMatchObject({ error: { code: 'unsupported_media_type' } })
    expect(chat).not.toHaveBeenCalled()
  })

  it('returns 400 for malformed JSON', async () => {
    env.OPENROUTER_API_KEY = 'test-key'
    const { status, json } = await callRoute(Route, 'POST', {
      url: '/api/chat',
      body: '{"messages":',
    })
    expect(status).toBe(400)
    expect(json).toMatchObject({ error: { code: 'invalid_json' } })
    expect(chat).not.toHaveBeenCalled()
  })

  it('returns 400 for a body that is not a chat request', async () => {
    env.OPENROUTER_API_KEY = 'test-key'
    const { status, json } = await callRoute(Route, 'POST', {
      url: '/api/chat',
      body: { messages: [] },
    })
    expect(status).toBe(400)
    expect(json).toEqual({
      error: {
        code: 'validation',
        message: 'The request is not a valid chat request.',
      },
    })
    expect(chat).not.toHaveBeenCalled()
  })

  it.each([
    [
      'too many messages',
      Array.from({ length: 101 }, (_, index) => ({
        id: `message-${index}`,
        role: 'user',
        content: 'Hi',
      })),
    ],
    [
      'a message that is too long',
      [{ id: 'message-1', role: 'user', content: 'x'.repeat(20_001) }],
    ],
  ])('returns 400 for %s', async (_name, messages) => {
    env.OPENROUTER_API_KEY = 'test-key'
    const { status, json } = await callRoute(Route, 'POST', {
      url: '/api/chat',
      body: { ...validBody, messages },
    })
    expect(status).toBe(400)
    expect(json).toMatchObject({ error: { code: 'validation' } })
    expect(chat).not.toHaveBeenCalled()
  })

  it('streams the reply as server-sent events', async () => {
    env.OPENROUTER_API_KEY = 'test-key'
    const handlers = Route.options.server?.handlers as {
      POST: (ctx: { request: Request }) => Promise<Response>
    }
    const response = await handlers.POST({
      request: new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validBody),
      }),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    expect(await response.text()).toContain('"type":"RUN_FINISHED"')
    expect(createOpenRouterText).toHaveBeenCalledWith(
      'openai/gpt-4o-mini',
      'test-key',
      { appTitle: 'todoOverKill' },
    )
    expect(chat).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 'thread-1',
        runId: 'run-1',
        systemPrompts: [expect.stringContaining('plain language')],
      }),
    )
  })

  it('aborts the model call when the request was aborted before it started', async () => {
    env.OPENROUTER_API_KEY = 'test-key'
    const client = new AbortController()
    const request = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validBody),
      signal: client.signal,
    })
    // Stop pressed while the body was still being read.
    client.abort()
    const handlers = Route.options.server?.handlers as {
      POST: (ctx: { request: Request }) => Promise<Response>
    }
    await handlers.POST({ request })

    const [{ abortController }] = chat.mock.calls[0] as unknown as [
      { abortController: AbortController },
    ]
    expect(abortController.signal.aborted).toBe(true)
  })
})
