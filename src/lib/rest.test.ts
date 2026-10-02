// @vitest-environment node
// src/server/errors imports the Prisma client, which is server code.
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as z from 'zod'

import { InvalidChatRequestError } from '#/lib/assistant'
import {
  InvalidJsonError,
  PayloadTooLargeError,
  UnsupportedMediaTypeError,
  errorResponse,
  handle,
  readJsonBody,
} from '#/lib/rest'
import { ConflictError, NotFoundError } from '#/server/errors'

afterEach(() => {
  vi.restoreAllMocks()
})

function jsonRequest(body: string, contentType = 'application/json') {
  return new Request('http://localhost/api', {
    method: 'POST',
    headers: { 'content-type': contentType },
    body,
  })
}

describe('readJsonBody', () => {
  it('returns the parsed body', async () => {
    await expect(readJsonBody(jsonRequest('{"a":1}'))).resolves.toEqual({
      a: 1,
    })
  })

  it('accepts a charset parameter and any letter case', async () => {
    const request = jsonRequest('{"a":1}', 'Application/JSON; charset=utf-8')

    await expect(readJsonBody(request)).resolves.toEqual({ a: 1 })
  })

  it.each([
    'text/plain',
    'application/x-www-form-urlencoded',
    'multipart/form-data',
  ])('throws UnsupportedMediaTypeError for %s', async (contentType) => {
    await expect(
      readJsonBody(jsonRequest('{"a":1}', contentType)),
    ).rejects.toBeInstanceOf(UnsupportedMediaTypeError)
  })

  it('throws UnsupportedMediaTypeError without a Content-Type', async () => {
    const request = new Request('http://localhost/api', {
      method: 'POST',
      body: new Uint8Array([123, 125]),
    })

    await expect(readJsonBody(request)).rejects.toBeInstanceOf(
      UnsupportedMediaTypeError,
    )
  })

  it.each(['', '{name:'])('throws InvalidJsonError for %j', async (body) => {
    await expect(readJsonBody(jsonRequest(body))).rejects.toBeInstanceOf(
      InvalidJsonError,
    )
  })
})

describe('readJsonBody with maxBytes', () => {
  it('refuses a Content-Length over the cap before reading the body', async () => {
    const request = new Request('http://localhost/api', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': '11' },
      body: '{"a":1}',
    })

    await expect(
      readJsonBody(request, { maxBytes: 10 }),
    ).rejects.toBeInstanceOf(PayloadTooLargeError)
    expect(request.bodyUsed).toBe(false)
  })

  it('refuses a body over the cap without a Content-Length', async () => {
    // A string body gets no Content-Length header here, as a chunked one
    // has none. Two bytes per é, so 6 characters are 12 bytes.
    const request = jsonRequest('"éééééé"')
    expect(request.headers.get('content-length')).toBeNull()

    await expect(
      readJsonBody(request, { maxBytes: 12 }),
    ).rejects.toBeInstanceOf(PayloadTooLargeError)
  })

  it('accepts a body of exactly the cap', async () => {
    await expect(
      readJsonBody(jsonRequest('"éééééé"'), { maxBytes: 14 }),
    ).resolves.toBe('éééééé')
  })

  it('still throws InvalidJsonError for a malformed body', async () => {
    await expect(
      readJsonBody(jsonRequest('{name:'), { maxBytes: 100 }),
    ).rejects.toBeInstanceOf(InvalidJsonError)
  })
})

describe('errorResponse', () => {
  it('maps a ZodError to 400 validation with the issues', async () => {
    const result = z.object({ name: z.string() }).safeParse({})
    const response = errorResponse(result.error)

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.code).toBe('validation')
    expect(body.error.message).toEqual(expect.any(String))
    expect(body.error.issues).toEqual([
      expect.objectContaining({ path: ['name'] }),
    ])
  })

  it('maps InvalidJsonError to 400 invalid_json', async () => {
    const response = errorResponse(new InvalidJsonError())

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: {
        code: 'invalid_json',
        message: 'The request body must be valid JSON.',
      },
    })
  })

  it('maps PayloadTooLargeError to 413 payload_too_large', async () => {
    const response = errorResponse(new PayloadTooLargeError())

    expect(response.status).toBe(413)
    expect(await response.json()).toEqual({
      error: {
        code: 'payload_too_large',
        message: 'The request body is too large.',
      },
    })
  })

  it('maps InvalidChatRequestError to 400 validation', async () => {
    const response = errorResponse(new InvalidChatRequestError())

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: {
        code: 'validation',
        message: 'The request is not a valid chat request.',
      },
    })
  })

  it('maps UnsupportedMediaTypeError to 415 unsupported_media_type', async () => {
    const response = errorResponse(new UnsupportedMediaTypeError())

    expect(response.status).toBe(415)
    expect(await response.json()).toEqual({
      error: {
        code: 'unsupported_media_type',
        message: 'The request body must be sent as application/json.',
      },
    })
  })

  it('maps NotFoundError to 404 not_found', async () => {
    const response = errorResponse(new NotFoundError('No project with id x.'))

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      error: { code: 'not_found', message: 'No project with id x.' },
    })
  })

  it('maps ConflictError to 409 conflict', async () => {
    const response = errorResponse(new ConflictError('Key taken.'))

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error: { code: 'conflict', message: 'Key taken.' },
    })
  })

  it('hides the message of any other error behind a 500', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const error = new Error('connection refused at 10.0.0.1')
    const response = errorResponse(error)

    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body.error.code).toBe('internal')
    expect(body.error.message).not.toContain('10.0.0.1')
    expect(log).toHaveBeenCalledWith(error)
  })
})

describe('handle', () => {
  it('returns the handler response', async () => {
    const response = await handle(() =>
      Promise.resolve(Response.json({ ok: true })),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  })

  it('turns a thrown error into the error response', async () => {
    const response = await handle(() =>
      Promise.reject(new NotFoundError('Gone.')),
    )

    expect(response.status).toBe(404)
  })
})
