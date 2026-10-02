// The assistant's request limits, shared by the panel and /api/chat. This
// module imports no server code, so the client bundle can use it.

/** Longest newest user message, and the composer's limit. */
export const MAX_CHAT_MESSAGE_LENGTH = 20_000

/** Messages kept, newest first, before the history goes to the model. */
export const MAX_CHAT_MESSAGES = 100

/**
 * Longest text in any one part of the history. Higher than the message
 * limit, so a long assistant reply can stay in the conversation.
 */
export const MAX_CHAT_PART_LENGTH = 100_000

/** Largest /api/chat body, checked before it is parsed. */
export const MAX_CHAT_BODY_BYTES = 1_048_576

/** Shown and announced when the composer refuses a message. */
export const MESSAGE_TOO_LONG_ERROR = 'Messages can be up to 20,000 characters.'

/**
 * Thrown by parseChatRequest when the body is not a chat request, or has no
 * user message to answer.
 */
export class InvalidChatRequestError extends Error {
  readonly code = 'validation'

  constructor(message = 'The request is not a valid chat request.') {
    super(message)
    this.name = 'InvalidChatRequestError'
  }
}
