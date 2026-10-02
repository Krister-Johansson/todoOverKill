// @vitest-environment node
// Node, because the route tests import the board and list routes, which
// import server code.
import { defaultParseSearch } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'

import {
  FILTER_KEYS,
  clearedFilters,
  filterAnnouncement,
  filterTasks,
  hasActiveFilters,
  matchesFilters,
  pickFilters,
  resolveFilters,
  sameFilters,
  taskFilterSearchSchema,
} from './task-filter'

import type { FilterableTask } from './task-filter'

type Task = FilterableTask & { id: string }

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    statusId: 's1',
    priority: 'none',
    labels: [],
    dueDate: null,
    completedAt: null,
    title: 'Write copy',
    description: null,
    ...overrides,
  }
}

// A fixed day, so no test depends on the clock.
const TODAY = '2026-10-15'

function ids(tasks: Array<Task>) {
  return tasks.map((t) => t.id)
}

describe('taskFilterSearchSchema', () => {
  it('keeps valid values', () => {
    expect(
      taskFilterSearchSchema.parse({
        status: 's1',
        priority: 'high',
        label: 'l1',
        due: 'week',
        q: 'copy',
      }),
    ).toEqual({
      status: 's1',
      priority: 'high',
      label: 'l1',
      due: 'week',
      q: 'copy',
    })
  })

  it('drops each invalid value instead of throwing', () => {
    expect(
      taskFilterSearchSchema.parse({
        status: '',
        priority: 'huge',
        label: 3,
        due: 'tomorrow',
        q: 'x'.repeat(201),
      }),
    ).toEqual({
      status: undefined,
      priority: undefined,
      label: undefined,
      due: undefined,
      q: undefined,
    })
  })

  it('trims the text and treats blank text as no filter', () => {
    expect(taskFilterSearchSchema.parse({ q: '  copy ' }).q).toBe('copy')
    expect(taskFilterSearchSchema.parse({ q: '   ' }).q).toBeUndefined()
  })

  it('keeps text the router parsed as a number or a boolean', () => {
    const parsed = defaultParseSearch('?q=2026')
    expect(parsed.q).toBe(2026)
    expect(taskFilterSearchSchema.parse(parsed).q).toBe('2026')
    expect(taskFilterSearchSchema.parse({ q: true }).q).toBe('true')
    expect(taskFilterSearchSchema.parse({ q: 1.5 }).q).toBe('1.5')
    expect(taskFilterSearchSchema.parse({ q: { a: 1 } }).q).toBeUndefined()
  })

  it('accepts an empty search', () => {
    expect(hasActiveFilters(taskFilterSearchSchema.parse({}))).toBe(false)
  })

  it('names every key in FILTER_KEYS', () => {
    expect(Object.keys(taskFilterSearchSchema.shape).sort()).toEqual(
      [...FILTER_KEYS].sort(),
    )
  })
})

describe('pickFilters', () => {
  it('leaves the sort out', () => {
    const search = { status: 's1', q: 'copy', sort: 'key', dir: 'asc' }
    expect(pickFilters(search)).toEqual({
      status: 's1',
      priority: undefined,
      label: undefined,
      due: undefined,
      q: 'copy',
    })
  })
})

describe('resolveFilters', () => {
  it('drops a status or label the project does not have', () => {
    const statuses = [{ id: 's1' }]
    const labels = [{ id: 'l1' }]
    expect(
      resolveFilters({ status: 's9', label: 'l9' }, statuses, labels),
    ).toEqual(clearedFilters())
    expect(
      resolveFilters({ status: 's1', label: 'l1' }, statuses, labels),
    ).toMatchObject({ status: 's1', label: 'l1' })
  })
})

describe('hasActiveFilters and clearedFilters', () => {
  it('is false once cleared and true with any filter', () => {
    expect(hasActiveFilters(clearedFilters())).toBe(false)
    expect(hasActiveFilters({ due: 'today' })).toBe(true)
  })

  it('counts a stale id in the URL as active, so Clear can remove it', () => {
    const search = { label: 'deleted-label', sort: 'title' }
    const resolved = resolveFilters(search, [], [])
    expect(hasActiveFilters(resolved)).toBe(false)
    expect(hasActiveFilters(pickFilters(search))).toBe(true)
  })
})

describe('sameFilters', () => {
  it('compares the filter keys and ignores the rest', () => {
    expect(sameFilters({ due: 'today' }, { due: 'today' })).toBe(true)
    expect(sameFilters({}, clearedFilters())).toBe(true)
    expect(sameFilters({ due: 'today' }, { due: 'week' })).toBe(false)
    expect(sameFilters({ q: 'a' }, {})).toBe(false)
  })
})

describe('filterTasks', () => {
  it('returns every task with no filters, in order', () => {
    const tasks = [task({ id: 'a' }), task({ id: 'b' })]
    expect(ids(filterTasks(tasks, {}, TODAY))).toEqual(['a', 'b'])
  })

  it('filters by status, priority and label', () => {
    const tasks = [
      task({ id: 'a', statusId: 's1', priority: 'high' }),
      task({ id: 'b', statusId: 's2', priority: 'high' }),
      task({ id: 'c', statusId: 's1', priority: 'low' }),
      task({ id: 'd', labels: [{ id: 'l1' }, { id: 'l2' }] }),
    ]
    expect(ids(filterTasks(tasks, { status: 's2' }, TODAY))).toEqual(['b'])
    expect(ids(filterTasks(tasks, { priority: 'high' }, TODAY))).toEqual([
      'a',
      'b',
    ])
    expect(ids(filterTasks(tasks, { label: 'l2' }, TODAY))).toEqual(['d'])
  })

  it('matches text in the title or description, ignoring case', () => {
    const tasks = [
      task({ id: 'a', title: 'Fix the LOGIN form' }),
      task({ id: 'b', title: 'Other', description: 'about login' }),
      task({ id: 'c', title: 'Other' }),
    ]
    expect(ids(filterTasks(tasks, { q: 'Login' }, TODAY))).toEqual(['a', 'b'])
  })

  it('needs every filter that is set to match', () => {
    const tasks = [
      task({ id: 'a', statusId: 's1', priority: 'high', title: 'Copy' }),
      task({ id: 'b', statusId: 's1', priority: 'low', title: 'Copy' }),
      task({ id: 'c', statusId: 's2', priority: 'high', title: 'Copy' }),
    ]
    expect(
      ids(
        filterTasks(tasks, { status: 's1', priority: 'high', q: 'cop' }, TODAY),
      ),
    ).toEqual(['a'])
  })

  it('applies the due presets from the given today', () => {
    const tasks = [
      task({ id: 'none' }),
      task({ id: 'yesterday', dueDate: '2026-10-14' }),
      task({
        id: 'done-yesterday',
        dueDate: '2026-10-14',
        completedAt: new Date('2026-10-14T12:00:00.000Z'),
      }),
      task({ id: 'today', dueDate: '2026-10-15' }),
      task({ id: 'sixth-day', dueDate: '2026-10-21' }),
      task({ id: 'seventh-day', dueDate: '2026-10-22' }),
    ]
    expect(ids(filterTasks(tasks, { due: 'overdue' }, TODAY))).toEqual([
      'yesterday',
    ])
    expect(ids(filterTasks(tasks, { due: 'today' }, TODAY))).toEqual(['today'])
    expect(ids(filterTasks(tasks, { due: 'week' }, TODAY))).toEqual([
      'today',
      'sixth-day',
    ])
  })

  it('agrees with matchesFilters', () => {
    const one = task({ priority: 'urgent' })
    expect(matchesFilters(one, { priority: 'urgent' }, TODAY)).toBe(true)
    expect(matchesFilters(one, { priority: 'low' }, TODAY)).toBe(false)
  })
})

describe('filterAnnouncement', () => {
  it('says how many tasks are shown', () => {
    expect(filterAnnouncement(3, 12)).toBe('Showing 3 of 12 tasks')
    expect(filterAnnouncement(0, 1)).toBe('Showing 0 of 1 task')
    expect(filterAnnouncement(12, 12)).toBe('Showing all 12 tasks')
    expect(filterAnnouncement(0, 0)).toBe('No tasks')
  })
})

describe('the board and list routes', () => {
  it('the board takes the filters', async () => {
    const { Route } = await import('#/routes/_app/projects.$projectId.board')
    const schema = Route.options.validateSearch
    if (!schema || !('~standard' in schema)) throw new Error('No schema')
    const result = await schema['~standard'].validate({
      priority: 'high',
      due: 'soon',
      q: 'copy',
    })
    expect(result.issues).toBeUndefined()
    expect(result).toMatchObject({
      value: { priority: 'high', due: undefined, q: 'copy' },
    })
  })

  it('the board filters by text the router parsed as a number', async () => {
    const { Route } = await import('#/routes/_app/projects.$projectId.board')
    const schema = Route.options.validateSearch
    if (!schema || !('~standard' in schema)) throw new Error('No schema')
    const result = await schema['~standard'].validate(
      defaultParseSearch('?q=2026'),
    )
    expect(result).toMatchObject({ value: { q: '2026' } })
  })

  it('the list takes the filters and keeps its sort', async () => {
    const { Route } = await import('#/routes/_app/projects.$projectId.list')
    const schema = Route.options.validateSearch
    if (!schema || !('~standard' in schema)) throw new Error('No schema')
    const result = await schema['~standard'].validate({
      status: 's1',
      label: 'l1',
      sort: 'priority',
      dir: 'desc',
    })
    expect(result.issues).toBeUndefined()
    expect(result).toMatchObject({
      value: { status: 's1', label: 'l1', sort: 'priority', dir: 'desc' },
    })
  })
})
