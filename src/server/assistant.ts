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

export {
  InvalidChatRequestError,
  MAX_CHAT_MESSAGES,
  MAX_CHAT_MESSAGE_LENGTH,
} from '#/lib/assistant'

/** A string capped at MAX_CHAT_PART_LENGTH. */
const partText = z.string().max(MAX_CHAT_PART_LENGTH)

/**
 * One content part. Both shapes are on the wire: TanStack's `parts` carry
 * `content`, AG-UI's content parts carry `text`.
 */
const chatPartSchema = z.looseObject({
  content: partText.optional(),
  text: partText.optional(),
})

const chatPartsSchema = z.array(chatPartSchema).max(20)

/**
 * Caps what a chat request may forward to OpenRouter. The AG-UI shape itself
 * is checked by chatParamsFromRequestBody; this only bounds the size of each
 * part, so a large body is refused before it costs anything. The length of
 * the history is not capped here: trimChatHistory keeps the newest messages.
 */
const chatRequestLimitsSchema = z.looseObject({
  messages: z.array(
    z.looseObject({
      content: z
        .union([partText, chatPartsSchema, z.record(z.string(), z.unknown())])
        .optional(),
      parts: chatPartsSchema.optional(),
    }),
  ),
})

/** The newest user message, checked after the role filter. */
const newestUserMessageSchema = z
  .string()
  .max(MAX_CHAT_MESSAGE_LENGTH, 'The newest message is too long.')

export type ChatRequest = Awaited<ReturnType<typeof chatParamsFromRequestBody>>

type ChatMessage = ChatRequest['messages'][number]

/** A message's text: its string content, or the text of its parts. */
function chatMessageText(message: ChatMessage) {
  const content: unknown = 'content' in message ? message.content : undefined
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((part: { text?: unknown; content?: unknown }) => {
      if (typeof part.text === 'string') return part.text
      if (typeof part.content === 'string') return part.content
      return ''
    })
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
 * A parsed AG-UI RunAgentInput, within the size caps and with its history
 * trimmed by trimChatHistory. Throws a ZodError when a part or the newest user
 * message is too long, and InvalidChatRequestError when it is not AG-UI.
 */
export async function parseChatRequest(body: unknown): Promise<ChatRequest> {
  chatRequestLimitsSchema.parse(body)
  let request: ChatRequest
  try {
    request = await chatParamsFromRequestBody(body)
  } catch {
    throw new InvalidChatRequestError()
  }
  const messages = trimChatHistory(request.messages)
  // Checked on the kept history, so a short message sent after a long user
  // message cannot carry the long one past the cap.
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
