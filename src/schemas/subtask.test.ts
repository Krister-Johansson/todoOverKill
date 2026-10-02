import { describe, expect, it } from 'vitest'

import {
  createSubtaskSchema,
  moveSubtaskSchema,
  updateSubtaskSchema,
} from '#/schemas/subtask'

describe('createSubtaskSchema', () => {
  it('trims the title', () => {
    expect(createSubtaskSchema.parse({ title: '  Draft the intro ' })).toEqual({
      title: 'Draft the intro',
    })
  })

  it.each(['', '   ', 'x'.repeat(201)])('rejects the title %j', (title) => {
    expect(createSubtaskSchema.safeParse({ title }).success).toBe(false)
  })

  it('accepts a 200 character title', () => {
    const title = 'x'.repeat(200)
    expect(createSubtaskSchema.parse({ title }).title).toBe(title)
  })

  it('says a blank title is required', () => {
    const result = createSubtaskSchema.safeParse({ title: ' ' })
    expect(result.error?.issues[0].message).toBe('Title is required.')
  })

  it('rejects an unknown key', () => {
    const result = createSubtaskSchema.safeParse({ title: 'A', done: true })
    expect(result.error?.issues[0].code).toBe('unrecognized_keys')
  })
})

describe('updateSubtaskSchema', () => {
  it('accepts a title, done, both, or neither', () => {
    expect(updateSubtaskSchema.parse({ title: ' A ' })).toEqual({ title: 'A' })
    expect(updateSubtaskSchema.parse({ done: true })).toEqual({ done: true })
    expect(updateSubtaskSchema.parse({ title: 'A', done: false })).toEqual({
      title: 'A',
      done: false,
    })
    expect(updateSubtaskSchema.parse({})).toEqual({})
  })

  it('rejects a blank title and a done that is not a boolean', () => {
    expect(updateSubtaskSchema.safeParse({ title: '' }).success).toBe(false)
    expect(updateSubtaskSchema.safeParse({ done: 'yes' }).success).toBe(false)
  })

  it('rejects an unknown key', () => {
    const result = updateSubtaskSchema.safeParse({ order: 2 })
    expect(result.error?.issues[0].code).toBe('unrecognized_keys')
  })
})

describe('moveSubtaskSchema', () => {
  it('accepts a whole number of 0 or more', () => {
    expect(moveSubtaskSchema.parse({ index: 0 })).toEqual({ index: 0 })
    expect(moveSubtaskSchema.parse({ index: 7 })).toEqual({ index: 7 })
  })

  it.each([-1, 1.5, '1'])('rejects the index %j', (index) => {
    expect(moveSubtaskSchema.safeParse({ index }).success).toBe(false)
  })

  it('requires an index and rejects an unknown key', () => {
    expect(moveSubtaskSchema.safeParse({}).success).toBe(false)
    const result = moveSubtaskSchema.safeParse({ index: 0, taskId: 't' })
    expect(result.error?.issues[0].code).toBe('unrecognized_keys')
  })
})
