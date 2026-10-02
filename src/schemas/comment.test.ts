import { describe, expect, it } from 'vitest'

import { createCommentSchema, updateCommentSchema } from '#/schemas/comment'

describe.each([
  ['createCommentSchema', createCommentSchema],
  ['updateCommentSchema', updateCommentSchema],
])('%s', (_, schema) => {
  it('trims the body', () => {
    expect(schema.parse({ body: '  Looks good \n' })).toEqual({
      body: 'Looks good',
    })
  })

  it.each(['', '   ', 'x'.repeat(10_001)])('rejects the body %j', (body) => {
    expect(schema.safeParse({ body }).success).toBe(false)
  })

  it('accepts a 10000 character body', () => {
    const body = 'x'.repeat(10_000)
    expect(schema.parse({ body }).body).toBe(body)
  })

  it('says a blank body is required', () => {
    const result = schema.safeParse({ body: ' ' })
    expect(result.error?.issues[0].message).toBe('Comment is required.')
  })

  it('says how long a body may be', () => {
    const result = schema.safeParse({ body: 'x'.repeat(10_001) })
    expect(result.error?.issues[0].message).toBe(
      'Comment must be 10000 characters or fewer.',
    )
  })

  it('requires a body', () => {
    expect(schema.safeParse({}).success).toBe(false)
  })

  it('rejects an unknown key', () => {
    const result = schema.safeParse({ body: 'A', taskId: 't' })
    expect(result.error?.issues[0].code).toBe('unrecognized_keys')
  })
})
