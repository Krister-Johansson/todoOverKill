import { chat, chatParamsFromRequestBody } from '@tanstack/ai'
import { createOpenRouterText } from '@tanstack/ai-openrouter'
import * as z from 'zod'

import { env } from '#/env'

/** What the panel shows when OPENROUTER_API_KEY is not set. */
export const ASSISTANT_DISABLED_MESSAGE =
  'The assistant is off. Set OPENROUTER_API_KEY in .env and restart the app.'

/**
 * The assistant's instructions. Plain language and short replies, so a reply
 * reads at a lower secondary level (docs/accessibility.md 3.1.5). It has no
 * tools until F39, so it must not claim to change anything.
 */
export const ASSISTANT_SYSTEM_PROMPT = [
  'You are the assistant in todoOverKill, a project and task manager.',
  'Answer in plain language with short sentences and short replies.',
  'Use lists only when they help. Explain any technical word you use.',
  'You cannot read or change projects or tasks yet. If asked to, say so,',
  'and tell the user where in the app they can do it themselves.',
].join(' ')

/** Longest conversation, and longest single message, sent to the model. */
export const MAX_CHAT_MESSAGES = 100
export const MAX_CHAT_MESSAGE_LENGTH = 20_000

/**
 * Caps what a chat request may forward to OpenRouter. The AG-UI shape itself
 * is checked by chatParamsFromRequestBody; this only bounds its size, so a
 * large body is refused before it costs anything.
 */
const chatRequestLimitsSchema = z.looseObject({
  messages: z
    .array(
      z.looseObject({
        content: z
          .union([
            z.string().max(MAX_CHAT_MESSAGE_LENGTH),
            z.array(z.unknown()).max(20),
            z.record(z.string(), z.unknown()),
          ])
          .optional(),
      }),
    )
    .max(MAX_CHAT_MESSAGES),
})

/** Thrown by parseChatRequest when the body is not a chat request. */
export class InvalidChatRequestError extends Error {
  readonly code = 'validation'

  constructor() {
    super('The request is not a valid chat request.')
    this.name = 'InvalidChatRequestError'
  }
}

export type ChatRequest = Awaited<ReturnType<typeof chatParamsFromRequestBody>>

/**
 * A parsed AG-UI RunAgentInput, within the size caps. Throws a ZodError when
 * it is too large and InvalidChatRequestError when it is not AG-UI.
 */
export async function parseChatRequest(body: unknown): Promise<ChatRequest> {
  chatRequestLimitsSchema.parse(body)
  try {
    return await chatParamsFromRequestBody(body)
  } catch {
    throw new InvalidChatRequestError()
  }
}

/**
 * Whether the assistant can run. Only the key's presence leaves the server,
 * never the key.
 */
export function getAssistantStatus() {
  return { enabled: env.OPENROUTER_API_KEY !== undefined }
}

type OpenRouterModel = Parameters<typeof createOpenRouterText>[0]

/**
 * Starts the model's reply to a chat request, with no tools until F39. The
 * caller streams the result out over its transport. Returns null when
 * OPENROUTER_API_KEY is not set.
 *
 * Aborting `signal`, as a closed connection does, aborts the model call and
 * ends the stream, even when it was aborted before this was called.
 */
export function startAssistantReply(request: ChatRequest, signal: AbortSignal) {
  const apiKey = env.OPENROUTER_API_KEY
  if (apiKey === undefined) return null

  // Any OpenRouter model id works; the adapter's union only lists the ones
  // it has metadata for.
  const adapter = createOpenRouterText(
    env.OPENROUTER_MODEL as OpenRouterModel,
    apiKey,
    { appTitle: 'todoOverKill' },
  )
  const abortController = new AbortController()
  if (signal.aborted) abortController.abort()
  else {
    signal.addEventListener('abort', () => abortController.abort(), {
      once: true,
    })
  }

  const stream = chat({
    adapter,
    messages: request.messages,
    threadId: request.threadId,
    runId: request.runId,
    systemPrompts: [ASSISTANT_SYSTEM_PROMPT],
    abortController,
  })
  return { stream, abortController }
}
