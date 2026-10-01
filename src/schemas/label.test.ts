import { describe, expect, it } from 'vitest'

import { createLabelSchema, labelIdsSchema } from '#/schemas/label'

describe('createLabelSchema', () => {
  it('trims the name and keeps a palette colour', () => {
    expect(
      createLabelSchema.parse({ name: '  design ', color: '#2563eb' }),
    ).toEqual({ name: 'design', color: '#2563eb' })
  })

  it('lower-cases a palette colour given in upper case', () => {
    expect(
      createLabelSchema.parse({ name: 'design', color: '#2563EB' }).color,
    ).toBe('#2563eb')
  })

  it.each(['', '   ', 'x'.repeat(51)])('rejects the name %j', (name) => {
    expect(
      createLabelSchema.safeParse({ name, color: '#2563eb' }).success,
    ).toBe(false)
  })

  it('accepts a 50 character name', () => {
    const name = 'x'.repeat(50)
    expect(createLabelSchema.parse({ name, color: '#2563eb' }).name).toBe(name)
  })

  it.each(['#1d4ed8', 'blue', ''])('rejects the colour %j', (color) => {
    const result = createLabelSchema.safeParse({ name: 'design', color })
    expect(result.error?.issues).toEqual([
      expect.objectContaining({
        path: ['color'],
        message: 'Colour must be one of the project colours.',
      }),
    ])
  })
})

describe('labelIdsSchema', () => {
  it('accepts distinct ids and an empty list', () => {
    expect(labelIdsSchema.parse(['a', 'b'])).toEqual(['a', 'b'])
    expect(labelIdsSchema.parse([])).toEqual([])
  })

  it('rejects a repeated id', () => {
    const result = labelIdsSchema.safeParse(['a', 'b', 'a'])
    expect(result.error?.issues[0].message).toBe(
      'Each label may appear only once.',
    )
  })

  it('rejects an empty id', () => {
    expect(labelIdsSchema.safeParse(['']).success).toBe(false)
  })
})
