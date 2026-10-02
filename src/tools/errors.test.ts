// @vitest-environment node
// Server code runs without `window`. Under jsdom, t3-env treats the module as
// client code and blocks every server variable.
import * as z from 'zod'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ConflictError, NotFoundError } from '#/server/errors'
import { ToolError, toToolError } from '#/tools/errors'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('toToolError', () => {
  it('keeps the code and message of a NotFoundError', () => {
    const error = toToolError(new NotFoundError('No task with id t1.'))

    expect(error).toBeInstanceOf(ToolError)
    expect(error).toMatchObject({
      code: 'not_found',
      message: 'No task with id t1.',
    })
  })

  it('keeps the code and message of a ConflictError', () => {
    const error = toToolError(new ConflictError('Another project uses TOK.'))

    expect(error).toBeInstanceOf(ToolError)
    expect(error).toMatchObject({
      code: 'conflict',
      message: 'Another project uses TOK.',
    })
  })

  it('turns a ZodError into readable lines with the path', () => {
    const result = z
      .object({ projectId: z.string(), limit: z.int().max(50) })
      .safeParse({ limit: 99 })
    if (result.success) throw new Error('Expected the parse to fail.')

    const error = toToolError(result.error)

    expect(error).toBeInstanceOf(ToolError)
    expect(error).toMatchObject({ code: 'validation' })
    expect(error).not.toHaveProperty('issues')
    const { message } = error
    expect(message).toContain('The input is not valid.')
    expect(message).toContain('→ at projectId')
    expect(message).toContain('→ at limit')
    expect(message).not.toContain('"code"')
  })

  it('logs any other error and hides its message', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const cause = new Error(
      'Invalid `prisma.task.findMany()` invocation: connection to 127.0.0.1:5434 refused.',
    )

    const error = toToolError(cause)

    expect(error).toBeInstanceOf(ToolError)
    expect(error).toMatchObject({
      code: 'internal',
      message: 'Something went wrong on the server.',
    })
    expect(error.message).not.toContain('prisma')
    expect(log).toHaveBeenCalledWith(cause)
  })
})
