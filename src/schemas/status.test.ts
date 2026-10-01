import { describe, expect, it } from 'vitest'

import {
  createStatusSchema,
  renameStatusSchema,
  reorderStatusesSchema,
} from '#/schemas/status'

describe('createStatusSchema', () => {
  it('trims the name and keeps the category', () => {
    expect(
      createStatusSchema.parse({ name: '  Review ', category: 'in_progress' }),
    ).toEqual({ name: 'Review', category: 'in_progress' })
  })

  it.each(['', '   ', 'x'.repeat(51)])('rejects the name %j', (name) => {
    expect(
      createStatusSchema.safeParse({ name, category: 'todo' }).success,
    ).toBe(false)
  })

  it('accepts a 50 character name', () => {
    const name = 'x'.repeat(50)
    expect(createStatusSchema.parse({ name, category: 'done' }).name).toBe(name)
  })

  it('rejects an unknown category', () => {
    const result = createStatusSchema.safeParse({
      name: 'Review',
      category: 'blocked',
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].message).toMatch(
      /todo, in_progress, or done/,
    )
  })
})

describe('renameStatusSchema', () => {
  it('trims the name', () => {
    expect(renameStatusSchema.parse({ name: ' Doing ' })).toEqual({
      name: 'Doing',
    })
  })

  it('rejects an empty name', () => {
    const result = renameStatusSchema.safeParse({ name: ' ' })
    expect(result.error?.issues[0].message).toBe('Name is required.')
  })
})

describe('reorderStatusesSchema', () => {
  it('accepts a list of distinct ids', () => {
    expect(reorderStatusesSchema.parse({ statusIds: ['a', 'b'] })).toEqual({
      statusIds: ['a', 'b'],
    })
  })

  it('rejects an empty list', () => {
    expect(reorderStatusesSchema.safeParse({ statusIds: [] }).success).toBe(
      false,
    )
  })

  it('rejects duplicate ids', () => {
    const result = reorderStatusesSchema.safeParse({ statusIds: ['a', 'a'] })
    expect(result.error?.issues[0].message).toBe(
      'Each status may appear only once.',
    )
  })

  it('rejects an empty id', () => {
    expect(reorderStatusesSchema.safeParse({ statusIds: [''] }).success).toBe(
      false,
    )
  })
})
