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

/**
 * Whether the assistant can run, and the model it uses. Only the key's
 * presence leaves the server, never the key.
 */
export function getAssistantStatus() {
  return {
    enabled: env.OPENROUTER_API_KEY !== undefined,
    model: env.OPENROUTER_MODEL,
  }
}
