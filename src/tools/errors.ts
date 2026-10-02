import * as z from 'zod'

import { ConflictError, NotFoundError } from '#/server/errors'

export type ToolErrorCode = 'not_found' | 'conflict' | 'validation'

/**
 * A mistake the caller can fix, such as an unknown id or a bad filter. The
 * message is what the model or the MCP client reads, so it says what was
 * wrong in plain words.
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
 * maps it to a REST error. A ZodError's issues become readable lines, one per
 * issue with its path, rather than the issues array. Any other error comes
 * back unchanged.
 */
export function toToolError(error: unknown) {
  if (error instanceof NotFoundError || error instanceof ConflictError) {
    return new ToolError(error.code, error.message)
  }
  if (error instanceof z.ZodError) {
    return new ToolError(
      'validation',
      `The input is not valid.\n${z.prettifyError(error)}`,
    )
  }
  return error
}
