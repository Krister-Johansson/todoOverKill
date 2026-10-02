import type { UIMessage } from '@tanstack/ai-react'

type MessagePart = UIMessage['parts'][number]

export type ToolCallPart = Extract<MessagePart, { type: 'tool-call' }>
export type ToolResultPart = Extract<MessagePart, { type: 'tool-result' }>

export type ToolCallStatus =
  'running' | 'done' | 'failed' | 'needs-approval' | 'stopped'

export const TOOL_CALL_STATUS_LABELS: Record<ToolCallStatus, string> = {
  running: 'Running',
  done: 'Done',
  failed: 'Failed',
  'needs-approval': 'Needs approval',
  stopped: 'Stopped',
}

/** A tool's name in plain words: `list_tasks` is "List tasks". */
export function toolDisplayName(name: string) {
  const words = name.replaceAll('_', ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** The prefix chat() puts on a tool error it sends as text. */
const ERROR_PREFIX = 'Error executing tool: '

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Why a tool call failed, or undefined when it did not. chat() sends a
 * thrown error as the output `{ error: message }`, and the client marks the
 * call `error` only when the stream says so, so an output of that shape, or
 * a string with chat()'s error prefix, counts as a failure too. The message
 * is a ToolError's, written for people (src/tools/errors.ts).
 */
export function toolErrorText(part: ToolCallPart, result?: ToolResultPart) {
  const output: unknown = part.output
  if (result?.error) return result.error
  if (isRecord(output) && typeof output.error === 'string') {
    const keys = Object.keys(output)
    if (keys.length === 1 || part.state === 'error') return output.error
  }
  if (typeof output === 'string' && output.startsWith(ERROR_PREFIX)) {
    return output.slice(ERROR_PREFIX.length)
  }
  if (part.state === 'error' || result?.state === 'error') {
    return typeof output === 'string' && output ? output : 'The tool failed.'
  }
  return undefined
}

/**
 * Where a tool call stands. It is done once it has output, and failed when
 * toolErrorText finds an error. Without output it is running while the
 * reply still loads and stopped after, as when Stop ended the reply while
 * the tool ran. needs-approval is for F40's approval prompt.
 */
export function toolCallStatus(
  part: ToolCallPart,
  result: ToolResultPart | undefined,
  isLoading: boolean,
): ToolCallStatus {
  if (toolErrorText(part, result) !== undefined) return 'failed'
  if (part.output !== undefined || result?.state === 'complete') return 'done'
  if (part.state === 'approval-requested') return 'needs-approval'
  return isLoading ? 'running' : 'stopped'
}

/** The longest summary, so a long title or comment never fills the card. */
const MAX_SUMMARY_LENGTH = 60

function shorten(text: string) {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length > MAX_SUMMARY_LENGTH
    ? `${line.slice(0, MAX_SUMMARY_LENGTH - 1).trimEnd()}…`
    : line
}

const NOUNS = {
  projects: ['project', 'projects'],
  tasks: ['task', 'tasks'],
  subtasks: ['subtask', 'subtasks'],
  labels: ['label', 'labels'],
  comments: ['comment', 'comments'],
} as const

function count(items: Array<unknown>, [one, many]: readonly [string, string]) {
  return `${items.length} ${items.length === 1 ? one : many}`
}

/**
 * A one-line summary of a tool's output, never the output itself: a list
 * is counted ("2 tasks"), search counts both lists ("1 project and 2
 * tasks"), and a single item is its title, name or text, cut to
 * MAX_SUMMARY_LENGTH. Anything else is "Done". A list counts only when it is
 * the whole output, as the list tools return it: a task's labels or a
 * project's statuses belong to the item, which is named instead.
 */
export function toolResultSummary(output: unknown) {
  if (!isRecord(output)) return 'Done'
  const keys = Object.keys(output).sort().join(',')
  if (
    keys === 'projects,tasks' &&
    Array.isArray(output.projects) &&
    Array.isArray(output.tasks)
  ) {
    return `${count(output.projects, NOUNS.projects)} and ${count(output.tasks, NOUNS.tasks)}`
  }
  for (const [key, nouns] of Object.entries(NOUNS)) {
    const items = output[key]
    if (keys === key && Array.isArray(items)) return count(items, nouns)
  }
  for (const key of ['title', 'name', 'body']) {
    const text = output[key]
    if (typeof text === 'string' && text.trim()) return shorten(text)
  }
  return 'Done'
}

/**
 * The conversation with every tool call answered. A tool call with no
 * output and no result, as Stop leaves behind, is dropped, and so is a
 * result whose call is not in the message; a reply left with no parts goes
 * too. The model provider refuses a tool call that no result answers.
 * Messages without parts pass through unchanged.
 */
export function withAnsweredToolCalls<T>(messages: Array<T>): Array<T> {
  return messages.flatMap((message) => {
    if (!isRecord(message) || !Array.isArray(message.parts)) return [message]
    const parts = message.parts as Array<MessagePart>
    const results = new Set(
      parts.flatMap((part) =>
        part.type === 'tool-result' ? [part.toolCallId] : [],
      ),
    )
    const answered = new Set(
      parts.flatMap((part) =>
        part.type === 'tool-call' &&
        (part.output !== undefined ||
          results.has(part.id) ||
          (part.state === 'approval-responded' &&
            part.approval?.approved !== undefined))
          ? [part.id]
          : [],
      ),
    )
    const kept = parts.filter((part) =>
      part.type === 'tool-call'
        ? answered.has(part.id)
        : part.type !== 'tool-result' || answered.has(part.toolCallId),
    )
    if (kept.length === parts.length) return [message]
    if (kept.length === 0) return []
    return [{ ...message, parts: kept }]
  })
}
