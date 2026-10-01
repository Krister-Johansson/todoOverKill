import { describe, expect, it } from 'vitest'

import { moveDownInput, moveTaskInList, moveUpInput } from './board-move'

const statuses = [
  { id: 'todo', name: 'Backlog', category: 'todo' },
  { id: 'doing', name: 'In progress', category: 'in_progress' },
  { id: 'done', name: 'Done', category: 'done' },
]

const [todo, doing, done] = statuses

function task(
  id: string,
  status: (typeof statuses)[number],
  completedAt: Date | null = null,
) {
  return { id, statusId: status.id, status, completedAt }
}

/** a, b, c in Backlog, d in In progress, e in Done. */
function board() {
  const finished = new Date('2026-09-01T00:00:00Z')
  return [
    task('a', todo),
    task('b', todo),
    task('c', todo),
    task('d', doing),
    task('e', done, finished),
  ]
}

const ids = (tasks: Array<{ id: string }>) => tasks.map((t) => t.id)

describe('moveTaskInList', () => {
  it('moves a task to the end of another status without an index', () => {
    const moved = moveTaskInList(board(), 'a', { statusId: 'doing' }, statuses)
    expect(ids(moved)).toEqual(['b', 'c', 'd', 'a', 'e'])
    const a = moved.find((t) => t.id === 'a')!
    expect(a.statusId).toBe('doing')
    expect(a.status).toBe(doing)
  })

  it('moves a task to an index in another status', () => {
    const moved = moveTaskInList(
      board(),
      'c',
      { statusId: 'doing', index: 0 },
      statuses,
    )
    expect(ids(moved)).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(moved.find((t) => t.id === 'c')!.statusId).toBe('doing')
  })

  it('clamps an index past the end of the column', () => {
    const moved = moveTaskInList(
      board(),
      'a',
      { statusId: 'doing', index: 9 },
      statuses,
    )
    expect(ids(moved)).toEqual(['b', 'c', 'd', 'a', 'e'])
  })

  it('moves into an empty column', () => {
    const tasks = board().filter((t) => t.id !== 'd')
    const moved = moveTaskInList(tasks, 'b', { statusId: 'doing' }, statuses)
    expect(ids(moved)).toEqual(['a', 'c', 'b', 'e'])
  })

  it('reorders within a column with the up and down inputs', () => {
    expect(ids(moveTaskInList(board(), 'b', moveUpInput(1), statuses))).toEqual(
      ['b', 'a', 'c', 'd', 'e'],
    )
    expect(
      ids(moveTaskInList(board(), 'b', moveDownInput(1), statuses)),
    ).toEqual(['a', 'c', 'b', 'd', 'e'])
  })

  it('returns the same list when the task stays where it is', () => {
    const tasks = board()
    expect(moveTaskInList(tasks, 'a', { index: 0 }, statuses)).toBe(tasks)
    expect(moveTaskInList(tasks, 'c', { index: 5 }, statuses)).toBe(tasks)
    expect(moveTaskInList(tasks, 'b', { statusId: 'todo' }, statuses)).toBe(
      tasks,
    )
  })

  it('leaves the list alone for an unknown status or task', () => {
    const tasks = board()
    expect(moveTaskInList(tasks, 'a', { statusId: 'gone' }, statuses)).toBe(
      tasks,
    )
    expect(moveTaskInList(tasks, 'zz', { statusId: 'doing' }, statuses)).toBe(
      tasks,
    )
  })

  it('keeps the list order of the other tasks, whatever their order field', () => {
    // b and c share an order value; the list holds them by number, and a move
    // of a must not swap them.
    const tasks = board().map((t, i) => ({ ...t, order: i === 2 ? 1 : i }))
    const moved = moveTaskInList(tasks, 'a', { statusId: 'done' }, statuses)
    expect(ids(moved)).toEqual(['b', 'c', 'd', 'e', 'a'])
  })

  it('sets completedAt when entering a done status', () => {
    const moved = moveTaskInList(board(), 'a', { statusId: 'done' }, statuses)
    expect(moved.find((t) => t.id === 'a')!.completedAt).toBeInstanceOf(Date)
  })

  it('keeps completedAt for a reorder within a done status', () => {
    const tasks = [...board(), task('f', done, null)]
    const finished = tasks.find((t) => t.id === 'e')!.completedAt
    const moved = moveTaskInList(tasks, 'e', { index: 1 }, statuses)
    expect(ids(moved)).toEqual(['a', 'b', 'c', 'd', 'f', 'e'])
    expect(moved.find((t) => t.id === 'e')!.completedAt).toBe(finished)
  })

  it('clears completedAt when leaving a done status', () => {
    const moved = moveTaskInList(board(), 'e', { statusId: 'todo' }, statuses)
    expect(moved.find((t) => t.id === 'e')!.completedAt).toBeNull()
  })

  it('keeps completedAt as it is for a reorder in a status that is not done', () => {
    const stale = new Date('2026-01-01T00:00:00Z')
    const tasks = board().map((t) =>
      t.id === 'b' ? { ...t, completedAt: stale } : t,
    )
    const moved = moveTaskInList(tasks, 'b', { index: 0 }, statuses)
    expect(moved.find((t) => t.id === 'b')!.completedAt).toBe(stale)
  })

  it('keeps tasks of a status it does not know at the end', () => {
    const orphan = {
      id: 'x',
      statusId: 'old',
      status: { id: 'old', name: 'Old', category: 'todo' },
      completedAt: null,
    }
    const moved = moveTaskInList(
      [orphan, ...board()],
      'a',
      { statusId: 'doing' },
      statuses,
    )
    expect(ids(moved)).toEqual(['b', 'c', 'd', 'a', 'e', 'x'])
  })
})
