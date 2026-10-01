import { describe, expect, it } from 'vitest'

import {
  createTaskFormSchema,
  createTaskSchema,
  listTasksSchema,
  moveTaskSchema,
  toCreateTaskInput,
  updateTaskSchema,
} from '#/schemas/task'

describe('createTaskSchema', () => {
  it('trims the title and description and defaults the priority', () => {
    expect(
      createTaskSchema.parse({ title: '  Write copy ', description: ' Hero ' }),
    ).toEqual({ title: 'Write copy', description: 'Hero', priority: 'none' })
  })

  it.each(['', '   ', 'x'.repeat(201)])('rejects the title %j', (title) => {
    expect(createTaskSchema.safeParse({ title }).success).toBe(false)
  })

  it('accepts a 200 character title', () => {
    const title = 'x'.repeat(200)
    expect(createTaskSchema.parse({ title }).title).toBe(title)
  })

  it('rejects a description over 10000 characters', () => {
    const result = createTaskSchema.safeParse({
      title: 'Write copy',
      description: 'x'.repeat(10_001),
    })
    expect(result.error?.issues[0].message).toBe(
      'Description must be 10000 characters or fewer.',
    )
  })

  it('rejects an unknown priority', () => {
    const result = createTaskSchema.safeParse({
      title: 'Write copy',
      priority: 'critical',
    })
    expect(result.error?.issues[0].message).toMatch(
      /none, low, medium, high, or urgent/,
    )
  })

  it('accepts a calendar day as the due date', () => {
    expect(
      createTaskSchema.parse({ title: 'Write copy', dueDate: '2026-02-28' })
        .dueDate,
    ).toBe('2026-02-28')
  })

  it.each(['2026-13-01', '2026-1-1', '2026-02-30', '2026-10-01T00:00:00Z'])(
    'rejects the due date %j',
    (dueDate) => {
      const result = createTaskSchema.safeParse({
        title: 'Write copy',
        dueDate,
      })
      expect(result.error?.issues[0].message).toBe(
        'Date must be a calendar day such as 2026-10-01.',
      )
    },
  )
})

describe('updateTaskSchema', () => {
  it('accepts an empty patch', () => {
    expect(updateTaskSchema.parse({})).toEqual({})
  })

  it('keeps null for the description and due date, which clears them', () => {
    expect(
      updateTaskSchema.parse({ description: null, dueDate: null }),
    ).toEqual({ description: null, dueDate: null })
  })

  it('rejects a null title', () => {
    expect(updateTaskSchema.safeParse({ title: null }).success).toBe(false)
  })
})

describe('moveTaskSchema', () => {
  it('accepts a status, an index, or both', () => {
    expect(moveTaskSchema.parse({ statusId: 's' })).toEqual({ statusId: 's' })
    expect(moveTaskSchema.parse({ index: 0 })).toEqual({ index: 0 })
    expect(moveTaskSchema.parse({ statusId: 's', index: 2 })).toEqual({
      statusId: 's',
      index: 2,
    })
  })

  it('rejects a move with neither', () => {
    const result = moveTaskSchema.safeParse({})
    expect(result.error?.issues[0].message).toBe(
      'Give a status, an index, or both.',
    )
  })

  it.each([-1, 1.5])('rejects the index %j', (index) => {
    expect(moveTaskSchema.safeParse({ index }).success).toBe(false)
  })
})

describe('listTasksSchema', () => {
  it('accepts no filters', () => {
    expect(listTasksSchema.parse({})).toEqual({})
  })

  it('trims the search text and drops it when blank', () => {
    expect(listTasksSchema.parse({ q: '  copy ' }).q).toBe('copy')
    expect(listTasksSchema.parse({ q: '   ' }).q).toBeUndefined()
  })

  it('accepts a due range of one day', () => {
    expect(
      listTasksSchema.parse({ dueFrom: '2026-10-01', dueTo: '2026-10-01' }),
    ).toMatchObject({ dueFrom: '2026-10-01', dueTo: '2026-10-01' })
  })

  it('rejects a due range that ends before it starts', () => {
    const result = listTasksSchema.safeParse({
      dueFrom: '2026-10-02',
      dueTo: '2026-10-01',
    })
    expect(result.error?.issues[0].message).toBe(
      'The start of the due range must not be after its end.',
    )
  })
})

describe('createTaskFormSchema', () => {
  const values = {
    title: 'Write copy',
    description: '',
    statusId: 'status-1',
    priority: 'none' as const,
    dueDate: '',
  }

  it('accepts empty description and due date', () => {
    expect(createTaskFormSchema.safeParse(values).success).toBe(true)
  })

  it('accepts a calendar day as the due date', () => {
    expect(
      createTaskFormSchema.safeParse({ ...values, dueDate: '2026-10-01' })
        .success,
    ).toBe(true)
  })

  it('asks for a title', () => {
    const result = createTaskFormSchema.safeParse({ ...values, title: '  ' })
    expect(result.error?.issues[0]).toMatchObject({
      path: ['title'],
      message: 'Title is required.',
    })
  })

  it('rejects a due date that is not a calendar day', () => {
    const result = createTaskFormSchema.safeParse({
      ...values,
      dueDate: '2026-13-01',
    })
    expect(result.error?.issues[0]).toMatchObject({
      path: ['dueDate'],
      message: 'Date must be a calendar day such as 2026-10-01.',
    })
  })
})

describe('toCreateTaskInput', () => {
  it('leaves out empty strings', () => {
    expect(
      toCreateTaskInput({
        title: 'Write copy',
        description: '   ',
        statusId: '',
        priority: 'none',
        dueDate: '',
      }),
    ).toEqual({ title: 'Write copy', priority: 'none' })
  })

  it('passes the filled fields and no others', () => {
    const input = toCreateTaskInput({
      title: 'Write copy',
      description: 'Hero text',
      statusId: 'status-1',
      priority: 'high',
      dueDate: '2026-10-01',
    })
    expect(input).toEqual({
      title: 'Write copy',
      description: 'Hero text',
      statusId: 'status-1',
      priority: 'high',
      dueDate: '2026-10-01',
    })
    expect(Object.keys(input).sort()).toEqual(
      ['description', 'dueDate', 'priority', 'statusId', 'title'].sort(),
    )
    expect(createTaskSchema.safeParse(input).success).toBe(true)
  })
})
