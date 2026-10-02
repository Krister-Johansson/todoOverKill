import * as z from 'zod'

import { InvalidChatRequestError } from '#/lib/assistant'
import { ConflictError, NotFoundError } from '#/server/errors'

/** The body of every REST error response. */
export type ErrorBody = {
  error: {
    code:
      | 'validation'
      | 'invalid_json'
      | 'unsupported_media_type'
      | 'payload_too_large'
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

/** Thrown by readJsonBody when the body is over its `maxBytes`. */
export class PayloadTooLargeError extends Error {
  readonly code = 'payload_too_large'

  constructor() {
    super('The request body is too large.')
    this.name = 'PayloadTooLargeError'
  }
}

/**
 * The parsed JSON body. A Content-Type other than application/json throws
 * UnsupportedMediaTypeError, and an empty or malformed body throws
 * InvalidJsonError. With `maxBytes`, a body over that many bytes throws
 * PayloadTooLargeError before it is parsed.
 *
 * Requiring application/json means a cross-site page cannot write through a
 * text/plain "simple" request: the browser has to send a CORS preflight first,
 * and the API sends no CORS headers, so the preflight fails.
 */
export async function readJsonBody(
  request: Request,
  { maxBytes }: { maxBytes?: number } = {},
): Promise<unknown> {
  const mediaType = request.headers
    .get('content-type')
    ?.split(';')[0]
    .trim()
    .toLowerCase()
  if (mediaType !== 'application/json') throw new UnsupportedMediaTypeError()
  if (maxBytes === undefined) {
    try {
      return await request.json()
    } catch {
      throw new InvalidJsonError()
    }
  }
  // A Content-Length over the cap is refused before anything is read.
  if (Number(request.headers.get('content-length')) > maxBytes) {
    throw new PayloadTooLargeError()
  }
  // Without the header, as with a chunked body, the whole body is buffered
  // before it is measured: the 413 still comes before parsing, but memory is
  // not bounded by maxBytes.
  const text = await request.text()
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new PayloadTooLargeError()
  }
  try {
    return JSON.parse(text)
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
  if (error instanceof InvalidChatRequestError) {
    return errorJson(400, { code: error.code, message: error.message })
  }
  if (error instanceof UnsupportedMediaTypeError) {
    return errorJson(415, { code: error.code, message: error.message })
  }
  if (error instanceof PayloadTooLargeError) {
    return errorJson(413, { code: error.code, message: error.message })
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
