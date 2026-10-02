import * as z from 'zod'

import { ConflictError, NotFoundError } from '#/server/errors'

/**
 * confirmation_required is the code MCP returns when archive_project,
 * delete_task, delete_subtask or delete_comment is called without
 * confirm: true.
 */
export type ToolErrorCode =
  'not_found' | 'conflict' | 'validation' | 'internal' | 'confirmation_required'

/**
 * A tool call that failed. For not_found, conflict and validation the message
 * says what the caller can fix, such as an unknown id or a bad filter. The
 * message is what the model or the MCP client reads, so it is in plain words.
 */
export class ToolError extends Error {
  readonly code: ToolErrorCode

  constructor(code: ToolErrorCode, message: string) {
    super(message)
    this.name = 'ToolError'
    this.code = code
  }
}

/**
 * Maps a service error to a ToolError, as errorResponse in src/lib/rest.ts
 * maps it to a REST error. A ToolError is returned as it is. A ZodError's
 * issues become readable lines, one per issue with its path, rather than the
 * issues array. Any other error is logged and becomes an internal error
 * without its message, so database details never reach the model provider or
 * an MCP client.
 */
export function toToolError(error: unknown) {
  if (error instanceof ToolError) return error
  if (error instanceof NotFoundError || error instanceof ConflictError) {
    return new ToolError(error.code, error.message)
  }
  if (error instanceof z.ZodError) {
    return new ToolError(
      'validation',
      `The input is not valid.\n${z.prettifyError(error)}`,
    )
  }
  console.error(error)
  return new ToolError('internal', 'Something went wrong on the server.')
}
