import { chat, chatParamsFromRequestBody } from '@tanstack/ai'
import { createOpenRouterText } from '@tanstack/ai-openrouter'
import * as z from 'zod'

import { env } from '#/env'
import {
  InvalidChatRequestError,
  MAX_CHAT_MESSAGES,
  MAX_CHAT_MESSAGE_LENGTH,
  MAX_CHAT_PART_LENGTH,
} from '#/lib/assistant'

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

/** A string capped at MAX_CHAT_PART_LENGTH. */
const partText = z.string().max(MAX_CHAT_PART_LENGTH)

/**
 * Caps the size of each message that goes to OpenRouter. It runs on the kept
 * history only, so an old reply or a system message that trimChatHistory
 * drops cannot refuse the request. By then chatParamsFromRequestBody has
 * checked the AG-UI shape and dropped TanStack's `parts`, which never reach
 * the model: content is a string, or for a user message an array of AG-UI
 * content parts, which carry `text`. The number of parts is not capped; the
 * body limit bounds it.
 */
const keptMessagesSchema = z.array(
  z.looseObject({
    content: z
      .union([partText, z.array(z.looseObject({ text: partText.optional() }))])
      .optional(),
  }),
)

/** The newest user message, checked after the role filter. */
const newestUserMessageSchema = z
  .string()
  .max(MAX_CHAT_MESSAGE_LENGTH, 'The newest message is too long.')

export type ChatRequest = Awaited<ReturnType<typeof chatParamsFromRequestBody>>

type ChatMessage = ChatRequest['messages'][number]

/** A message's text: its string content, or the text of its content parts. */
function chatMessageText(message: ChatMessage) {
  const content: unknown = 'content' in message ? message.content : undefined
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((part: { text?: unknown }) =>
      typeof part.text === 'string' ? part.text : '',
    )
    .join('')
}

/**
 * The history the model sees. Only user and assistant messages are kept, so
 * a client cannot put a system or developer message beside
 * ASSISTANT_SYSTEM_PROMPT. F39 must let `tool` messages through once the
 * assistant has tools. Of those, the newest MAX_CHAT_MESSAGES are kept, and
 * an assistant message left at the start is dropped, as some models refuse a
 * conversation that does not start with the user.
 */
export function trimChatHistory(messages: Array<ChatMessage>) {
  const kept = messages
    .filter(
      (message) => message.role === 'user' || message.role === 'assistant',
    )
    .slice(-MAX_CHAT_MESSAGES)
  const firstUser = kept.findIndex((message) => message.role === 'user')
  return firstUser === -1 ? [] : kept.slice(firstUser)
}

/**
 * A parsed AG-UI RunAgentInput with its history trimmed by trimChatHistory and
 * within the size caps. Throws InvalidChatRequestError when the body is not
 * AG-UI or no user message is left to answer, and a ZodError when a kept part
 * or the newest user message is too long.
 */
export async function parseChatRequest(body: unknown): Promise<ChatRequest> {
  let request: ChatRequest
  try {
    request = await chatParamsFromRequestBody(body)
  } catch {
    throw new InvalidChatRequestError()
  }
  const messages = trimChatHistory(request.messages)
  if (messages.length === 0) {
    throw new InvalidChatRequestError('The request has no user message.')
  }
  keptMessagesSchema.parse(messages)
  // Only the newest user message is held to MAX_CHAT_MESSAGE_LENGTH. Older
  // messages, user ones included, are limited by the part cap alone. It is
  // found after the role filter, so a message sent after it cannot make it
  // count as older history.
  const newestUser = messages
    .filter((message) => message.role === 'user')
    .at(-1)
  if (newestUser) newestUserMessageSchema.parse(chatMessageText(newestUser))
  return { ...request, messages }
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
