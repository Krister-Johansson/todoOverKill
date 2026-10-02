// @vitest-environment node
// Server code runs without `window`. Under jsdom, t3-env treats the module as
// client code and blocks every server variable.
import * as z from 'zod'
import { describe, expect, it } from 'vitest'

import { ConflictError, NotFoundError } from '#/server/errors'
import { ToolError, toToolError } from '#/tools/errors'

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
    const { message } = error as ToolError
    expect(message).toContain('The input is not valid.')
    expect(message).toContain('→ at projectId')
    expect(message).toContain('→ at limit')
    expect(message).not.toContain('"code"')
  })

  it('returns any other error unchanged', () => {
    const error = new Error('Connection refused.')

    expect(toToolError(error)).toBe(error)
  })
})
