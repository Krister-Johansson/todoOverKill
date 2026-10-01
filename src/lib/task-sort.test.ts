// @vitest-environment node
// Node, because the route test imports the list route, which imports server
// code.
import { describe, expect, it } from 'vitest'

import {
  SORT_COLUMNS,
  TASK_COMPARATORS,
  listSearchSchema,
  priorityRank,
  searchToSorting,
  sortingToSearch,
} from './task-sort'

import type { SortableTask } from './task-sort'

function task(overrides: Partial<SortableTask> = {}): SortableTask {
  return {
    number: 1,
    title: 'Write copy',
    priority: 'none',
    dueDate: null,
    updatedAt: new Date('2026-10-01T12:00:00.000Z'),
    status: { order: 1 },
    ...overrides,
  }
}

/** The numbers of `tasks` sorted ascending by `column`. */
function sortedNumbers(
  column: (typeof SORT_COLUMNS)[number],
  tasks: Array<SortableTask>,
) {
  return [...tasks].sort(TASK_COMPARATORS[column]).map((t) => t.number)
}

describe('listSearchSchema', () => {
  it('keeps a valid column and direction', () => {
    expect(listSearchSchema.parse({ sort: 'priority', dir: 'desc' })).toEqual({
      sort: 'priority',
      dir: 'desc',
    })
  })

  it('drops an unknown column, a garbage direction, or a non-string', () => {
    expect(listSearchSchema.parse({ sort: 'bogus', dir: 'asc' })).toEqual({
      sort: undefined,
      dir: 'asc',
    })
    expect(listSearchSchema.parse({ sort: 'key', dir: 'up' })).toEqual({
      sort: 'key',
      dir: undefined,
    })
    expect(listSearchSchema.parse({ sort: 3, dir: ['asc'] })).toEqual({
      sort: undefined,
      dir: undefined,
    })
  })

  it('leaves both out when the URL has neither', () => {
    expect(listSearchSchema.parse({})).toEqual({})
  })
})

describe('searchToSorting', () => {
  it('sorts only when both the column and the direction are valid', () => {
    expect(searchToSorting({ sort: 'priority', dir: 'desc' })).toEqual([
      { id: 'priority', desc: true },
    ])
    expect(searchToSorting({ sort: 'key', dir: 'asc' })).toEqual([
      { id: 'key', desc: false },
    ])
  })

  it('is board order for a missing column or direction', () => {
    expect(searchToSorting({ sort: 'key' })).toEqual([])
    expect(searchToSorting({ dir: 'asc' })).toEqual([])
    expect(searchToSorting({})).toEqual([])
  })

  it('is board order for whatever the schema let through from a bad URL', () => {
    for (const raw of [
      { sort: 'bogus', dir: 'asc' },
      { sort: 'due' },
      { sort: 'title', dir: 'sideways' },
    ]) {
      expect(searchToSorting(listSearchSchema.parse(raw))).toEqual([])
    }
  })
})

describe('sortingToSearch', () => {
  it('writes the column and direction', () => {
    expect(sortingToSearch([{ id: 'due', desc: false }])).toEqual({
      sort: 'due',
      dir: 'asc',
    })
    expect(sortingToSearch([{ id: 'updated', desc: true }])).toEqual({
      sort: 'updated',
      dir: 'desc',
    })
  })

  it('clears both for no sort or an unknown column', () => {
    const cleared = { sort: undefined, dir: undefined }
    expect(sortingToSearch([])).toEqual(cleared)
    expect(sortingToSearch([{ id: 'labels', desc: false }])).toEqual(cleared)
  })

  it('round-trips through searchToSorting for every column', () => {
    for (const id of SORT_COLUMNS) {
      for (const desc of [false, true]) {
        expect(searchToSorting(sortingToSearch([{ id, desc }]))).toEqual([
          { id, desc },
        ])
      }
    }
  })
})

describe('priorityRank', () => {
  it('runs from none to urgent', () => {
    const ranks = (['none', 'low', 'medium', 'high', 'urgent'] as const).map(
      priorityRank,
    )
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
    expect(new Set(ranks).size).toBe(5)
  })
})

describe('TASK_COMPARATORS', () => {
  it('sorts the key by task number, not as text', () => {
    expect(
      sortedNumbers('key', [
        task({ number: 10 }),
        task({ number: 2 }),
        task({ number: 11 }),
      ]),
    ).toEqual([2, 10, 11])
  })

  it('sorts titles ignoring case, with numbers in order', () => {
    expect(
      sortedNumbers('title', [
        task({ number: 1, title: 'beta' }),
        task({ number: 2, title: 'Alpha 10' }),
        task({ number: 3, title: 'Alpha 9' }),
      ]),
    ).toEqual([3, 2, 1])
  })

  it('sorts status by the status order', () => {
    expect(
      sortedNumbers('status', [
        task({ number: 1, status: { order: 3 } }),
        task({ number: 2, status: { order: 1 } }),
        task({ number: 3, status: { order: 2 } }),
      ]),
    ).toEqual([2, 3, 1])
  })

  it('sorts priority by rank', () => {
    expect(
      sortedNumbers('priority', [
        task({ number: 1, priority: 'urgent' }),
        task({ number: 2, priority: 'none' }),
        task({ number: 3, priority: 'medium' }),
        task({ number: 4, priority: 'low' }),
        task({ number: 5, priority: 'high' }),
      ]),
    ).toEqual([2, 4, 3, 5, 1])
  })

  it('sorts due by day and puts a missing due date last', () => {
    expect(
      sortedNumbers('due', [
        task({ number: 1, dueDate: null }),
        task({ number: 2, dueDate: '2026-12-01' }),
        task({ number: 3, dueDate: '2026-02-15' }),
      ]),
    ).toEqual([3, 2, 1])
    expect(
      TASK_COMPARATORS.due(task({ dueDate: null }), task({ dueDate: null })),
    ).toBe(0)
  })

  it('sorts updated by time', () => {
    expect(
      sortedNumbers('updated', [
        task({ number: 1, updatedAt: new Date('2026-10-01T12:00:01Z') }),
        task({ number: 2, updatedAt: new Date('2026-10-01T12:00:00Z') }),
        task({ number: 3, updatedAt: new Date('2025-01-01T00:00:00Z') }),
      ]),
    ).toEqual([3, 2, 1])
  })

  it('has a comparator for every sortable column', () => {
    expect(Object.keys(TASK_COMPARATORS).sort()).toEqual(
      [...SORT_COLUMNS].sort(),
    )
  })
})

describe('the list route', () => {
  it('sorts only for a valid column and direction in its search', async () => {
    const { Route } = await import('#/routes/_app/projects.$projectId.list')
    const validate = Route.options.validateSearch
    expect(validate).toBe(listSearchSchema)
    const sortingFor = async (raw: Record<string, unknown>) => {
      const result = await listSearchSchema['~standard'].validate(raw)
      if (result.issues) throw new Error('validateSearch rejected the URL')
      return searchToSorting(result.value)
    }
    expect(await sortingFor({ sort: 'priority', dir: 'desc' })).toEqual([
      { id: 'priority', desc: true },
    ])
    expect(await sortingFor({ sort: 'bogus' })).toEqual([])
    expect(await sortingFor({ sort: 'key' })).toEqual([])
  })
})
