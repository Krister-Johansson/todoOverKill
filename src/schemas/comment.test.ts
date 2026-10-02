import { describe, expect, it } from 'vitest'

import {
  addCommentToolSchema,
  commentIdToolSchema,
  commentOutputSchema,
  createCommentSchema,
  updateCommentSchema,
  updateCommentToolSchema,
} from '#/schemas/comment'

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

describe('comment tool schemas', () => {
  it('takes the id beside the service fields', () => {
    expect(
      addCommentToolSchema.parse({ taskId: 't1', body: ' Looks good ' }),
    ).toEqual({ taskId: 't1', body: 'Looks good' })
    expect(
      updateCommentToolSchema.parse({ commentId: 'c1', body: 'Done' }),
    ).toEqual({ commentId: 'c1', body: 'Done' })
  })

  it.each([
    ['add_comment', addCommentToolSchema, { taskId: 't1', body: 'Hi' }],
    [
      'update_comment',
      updateCommentToolSchema,
      { commentId: 'c1', body: 'Hi' },
    ],
    ['a comment id', commentIdToolSchema, { commentId: 'c1' }],
  ])('rejects an unknown field in the %s input', (_name, schema, input) => {
    const result = schema.safeParse({ ...input, text: 'Hi' })
    expect(result.error?.issues).toEqual([
      expect.objectContaining({ code: 'unrecognized_keys', keys: ['text'] }),
    ])
  })

  it('rejects a missing id', () => {
    expect(addCommentToolSchema.safeParse({ body: 'Hi' }).success).toBe(false)
    expect(updateCommentToolSchema.safeParse({ body: 'Hi' }).success).toBe(
      false,
    )
    expect(commentIdToolSchema.safeParse({}).success).toBe(false)
  })

  it('accepts a comment as JSON, with ISO timestamps', () => {
    const comment = {
      id: 'c1',
      taskId: 't1',
      body: 'Looks good',
      createdAt: '2026-10-01T09:00:00.000Z',
      updatedAt: '2026-10-01T09:00:00.000Z',
    }
    expect(commentOutputSchema.parse(comment)).toEqual(comment)
    expect(
      commentOutputSchema.safeParse({ ...comment, createdAt: 'yesterday' })
        .success,
    ).toBe(false)
  })
})
