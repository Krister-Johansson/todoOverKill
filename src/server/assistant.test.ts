// @vitest-environment node
// Server code runs without `window`. Under jsdom, t3-env treats the module as
// client code and blocks every server variable.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ZodError } from 'zod'

import {
  InvalidChatRequestError,
  getAssistantStatus,
  parseChatRequest,
  startAssistantReply,
} from '#/server/assistant'

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
  chat: vi.fn(() => 'stream'),
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

beforeEach(() => {
  env.OPENROUTER_API_KEY = undefined
  createOpenRouterText.mockClear()
  chat.mockClear()
})

describe('getAssistantStatus', () => {
  it('is off without a key', () => {
    expect(getAssistantStatus()).toEqual({ enabled: false })
  })

  it('is on with a key, and never returns the key', () => {
    env.OPENROUTER_API_KEY = 'test-key'
    const status = getAssistantStatus()
    expect(status).toEqual({ enabled: true })
    expect(JSON.stringify(status)).not.toContain('test-key')
  })
})

describe('parseChatRequest', () => {
  it('returns the AG-UI params', async () => {
    const request = await parseChatRequest(validBody)
    expect(request).toMatchObject({ threadId: 'thread-1', runId: 'run-1' })
    expect(request.messages).toHaveLength(1)
  })

  it('refuses a body that is not AG-UI', async () => {
    await expect(parseChatRequest({ messages: [] })).rejects.toBeInstanceOf(
      InvalidChatRequestError,
    )
  })

  it('refuses a conversation over the caps', async () => {
    await expect(
      parseChatRequest({
        ...validBody,
        messages: [{ id: 'm', role: 'user', content: 'x'.repeat(20_001) }],
      }),
    ).rejects.toBeInstanceOf(ZodError)
  })
})

describe('startAssistantReply', () => {
  it('returns null without a key', async () => {
    const request = await parseChatRequest(validBody)
    expect(startAssistantReply(request, new AbortController().signal)).toBe(
      null,
    )
    expect(createOpenRouterText).not.toHaveBeenCalled()
  })

  it('passes an abort of the signal on to the model call', async () => {
    env.OPENROUTER_API_KEY = 'test-key'
    const client = new AbortController()
    const reply = startAssistantReply(
      await parseChatRequest(validBody),
      client.signal,
    )
    expect(reply?.stream).toBe('stream')
    expect(reply?.abortController.signal.aborted).toBe(false)

    client.abort()
    expect(reply?.abortController.signal.aborted).toBe(true)
  })

  it('starts aborted when the signal already is', async () => {
    env.OPENROUTER_API_KEY = 'test-key'
    const client = new AbortController()
    client.abort()
    const reply = startAssistantReply(
      await parseChatRequest(validBody),
      client.signal,
    )
    expect(reply?.abortController.signal.aborted).toBe(true)
  })
})
