import * as z from 'zod'

import { ConflictError, NotFoundError } from '#/server/errors'

/** The body of every REST error response. */
export type ErrorBody = {
  error: {
    code:
      | 'validation'
      | 'invalid_json'
      | 'unsupported_media_type'
      | 'not_found'
      | 'conflict'
      | 'internal'
      | 'assistant_disabled'
      | 'forbidden'
    message: string
    issues?: Array<z.core.$ZodIssue>
  }
}

/** Thrown by readJsonBody when the request body is not valid JSON. */
export class InvalidJsonError extends Error {
  readonly code = 'invalid_json'

  constructor() {
    super('The request body must be valid JSON.')
    this.name = 'InvalidJsonError'
  }
}

/** Thrown by readJsonBody when the body is not sent as application/json. */
export class UnsupportedMediaTypeError extends Error {
  readonly code = 'unsupported_media_type'

  constructor() {
    super('The request body must be sent as application/json.')
    this.name = 'UnsupportedMediaTypeError'
  }
}

/**
 * The parsed JSON body. A Content-Type other than application/json throws
 * UnsupportedMediaTypeError, and an empty or malformed body throws
 * InvalidJsonError.
 *
 * Requiring application/json means a cross-site page cannot write through a
 * text/plain "simple" request: the browser has to send a CORS preflight first,
 * and the API sends no CORS headers, so the preflight fails.
 */
export async function readJsonBody(request: Request): Promise<unknown> {
  const mediaType = request.headers
    .get('content-type')
    ?.split(';')[0]
    .trim()
    .toLowerCase()
  if (mediaType !== 'application/json') throw new UnsupportedMediaTypeError()
  try {
    return await request.json()
  } catch {
    throw new InvalidJsonError()
  }
}

/**
 * Maps a thrown error to the REST error envelope. Anything that is not a
 * known error is logged and returned as a 500 without its message, so
 * database details never reach the client.
 */
export function errorResponse(error: unknown): Response {
  if (error instanceof z.ZodError) {
    return errorJson(400, {
      code: 'validation',
      message: 'The request is not valid.',
      issues: error.issues,
    })
  }
  if (error instanceof InvalidJsonError) {
    return errorJson(400, { code: error.code, message: error.message })
  }
  if (error instanceof UnsupportedMediaTypeError) {
    return errorJson(415, { code: error.code, message: error.message })
  }
  if (error instanceof NotFoundError) {
    return errorJson(404, { code: error.code, message: error.message })
  }
  if (error instanceof ConflictError) {
    return errorJson(409, { code: error.code, message: error.message })
  }
  console.error(error)
  return errorJson(500, {
    code: 'internal',
    message: 'Something went wrong on the server.',
  })
}

/** A response with the REST error envelope. */
export function errorJson(status: number, error: ErrorBody['error']) {
  return Response.json({ error } satisfies ErrorBody, { status })
}

/**
 * Runs a route handler's body and turns a thrown error into the matching
 * error response. The body returns the success response itself. Taking a
 * thunk rather than wrapping the handler keeps Start's typing of `params`.
 */
export async function handle(body: () => Promise<Response>) {
  try {
    return await body()
  } catch (error) {
    return errorResponse(error)
  }
}
