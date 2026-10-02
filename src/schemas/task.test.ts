import { describe, expect, it } from 'vitest'

import {
  createTaskFormSchema,
  createTaskSchema,
  createTaskToolSchema,
  listTasksQuerySchema,
  listTasksSchema,
  moveTaskSchema,
  moveTaskToolSchema,
  patchTaskSchema,
  taskIdToolSchema,
  toCreateTaskInput,
  updateTaskSchema,
  updateTaskToolSchema,
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

  it('rejects an unknown field', () => {
    const result = createTaskSchema.safeParse({ title: 'Ship', status: 's1' })
    expect(result.error?.issues).toEqual([
      expect.objectContaining({ code: 'unrecognized_keys', keys: ['status'] }),
    ])
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

  it('accepts labelIds', () => {
    expect(
      createTaskSchema.parse({ title: 'Write copy', labelIds: ['l1', 'l2'] })
        .labelIds,
    ).toEqual(['l1', 'l2'])
  })

  it('rejects a repeated label id', () => {
    const result = createTaskSchema.safeParse({
      title: 'Write copy',
      labelIds: ['l1', 'l1'],
    })
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([
      ['labelIds'],
    ])
  })
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

  it('accepts labelIds as the new set', () => {
    expect(updateTaskSchema.parse({ labelIds: ['l1', 'l2'] })).toEqual({
      labelIds: ['l1', 'l2'],
    })
  })

  it('rejects a repeated label id', () => {
    const result = updateTaskSchema.safeParse({ labelIds: ['l1', 'l1'] })
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([
      ['labelIds'],
    ])
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

  it('accepts completed as a boolean only', () => {
    expect(listTasksSchema.parse({ completed: false })).toEqual({
      completed: false,
    })
    expect(listTasksSchema.parse({ completed: true })).toEqual({
      completed: true,
    })
    expect(listTasksSchema.safeParse({ completed: 'false' }).success).toBe(
      false,
    )
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

describe('listTasksQuerySchema', () => {
  it('accepts every F23 filter name', () => {
    expect(
      listTasksQuerySchema.parse({
        status: 's1',
        priority: 'high',
        label: 'l1',
        due: 'week',
        q: ' copy ',
      }),
    ).toEqual({
      status: 's1',
      priority: 'high',
      label: 'l1',
      due: 'week',
      q: 'copy',
    })
  })

  it('drops a blank search text', () => {
    expect(listTasksQuerySchema.parse({ q: '  ' })).toEqual({})
  })

  it('rejects a bad priority', () => {
    const result = listTasksQuerySchema.safeParse({ priority: 'huge' })
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([
      ['priority'],
    ])
  })

  it('treats an empty value as absent for every filter', () => {
    expect(
      listTasksQuerySchema.parse({
        status: '',
        priority: '',
        label: '',
        due: '',
        q: '',
      }),
    ).toEqual({})
  })

  it.each(['statusId', 'completed', 'dueFrom'])(
    'rejects the unknown filter %s',
    (name) => {
      const result = listTasksQuerySchema.safeParse({ [name]: 'x' })
      expect(result.error?.issues).toEqual([
        expect.objectContaining({ code: 'unrecognized_keys', keys: [name] }),
      ])
    },
  )

  it('rejects an unknown due value', () => {
    const due = 'soon'
    const result = listTasksQuerySchema.safeParse({ due })
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([['due']])
    expect(result.error?.issues[0].message).toBe(
      'Due must be overdue, today, or week.',
    )
  })
})

describe('patchTaskSchema', () => {
  it('accepts an empty patch', () => {
    expect(patchTaskSchema.parse({})).toEqual({})
  })

  it('accepts an empty labelIds, which clears the labels', () => {
    expect(patchTaskSchema.parse({ labelIds: [] })).toEqual({ labelIds: [] })
  })

  it('accepts fields and a move together', () => {
    expect(
      patchTaskSchema.parse({ title: ' Ship ', statusId: 's1', index: 0 }),
    ).toEqual({ title: 'Ship', statusId: 's1', index: 0 })
  })

  it.each([-1, 1.5])('rejects the index %j', (index) => {
    const result = patchTaskSchema.safeParse({ index })
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([['index']])
  })

  it('rejects an unknown field', () => {
    const result = patchTaskSchema.safeParse({ status: 's1' })
    expect(result.error?.issues).toEqual([
      expect.objectContaining({ code: 'unrecognized_keys', keys: ['status'] }),
    ])
  })
})

describe('write tool schemas', () => {
  it('takes the id beside the service fields', () => {
    expect(
      createTaskToolSchema.parse({ projectId: 'p1', title: ' Ship ' }),
    ).toEqual({ projectId: 'p1', title: 'Ship', priority: 'none' })
    expect(updateTaskToolSchema.parse({ taskId: 't1', dueDate: null })).toEqual(
      { taskId: 't1', dueDate: null },
    )
    expect(moveTaskToolSchema.parse({ taskId: 't1', index: 0 })).toEqual({
      taskId: 't1',
      index: 0,
    })
  })

  it.each([
    ['create_task', createTaskToolSchema, { projectId: 'p1', title: 'Ship' }],
    ['update_task', updateTaskToolSchema, { taskId: 't1' }],
    ['move_task', moveTaskToolSchema, { taskId: 't1', index: 0 }],
    ['a task id', taskIdToolSchema, { taskId: 't1' }],
  ])('rejects an unknown field in the %s input', (_name, schema, input) => {
    const result = schema.safeParse({ ...input, status: 's1' })
    expect(result.error?.issues).toEqual([
      expect.objectContaining({ code: 'unrecognized_keys', keys: ['status'] }),
    ])
  })

  it('rejects a missing id', () => {
    expect(createTaskToolSchema.safeParse({ title: 'Ship' }).success).toBe(
      false,
    )
    expect(updateTaskToolSchema.safeParse({}).success).toBe(false)
  })

  it('rejects a move with neither a status nor an index', () => {
    const result = moveTaskToolSchema.safeParse({ taskId: 't1' })
    expect(result.error?.issues[0].message).toBe(
      'Give a status, an index, or both.',
    )
  })
})
