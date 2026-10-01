import { MutationObserver, QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { moveTaskFn } from '#/fns/tasks'

import { moveTaskMutationOptions } from './task-move-menu'

import type { MoveRequest } from './task-move-menu'

vi.mock('#/fns/tasks', () => ({
  moveTaskFn: vi.fn(),
  tasksQueryOptions: (projectId: string) => ({
    queryKey: ['projects', projectId, 'tasks'],
  }),
  taskQueryOptions: (taskId: string) => ({ queryKey: ['tasks', taskId] }),
}))

vi.mock('#/fns/projects', () => ({
  projectQueryOptions: (id: string) => ({ queryKey: ['projects', id] }),
}))

type MovedTask = Awaited<ReturnType<typeof moveTaskFn>>

const move = vi.mocked(moveTaskFn)
const tasksKey = ['projects', 'p1', 'tasks']

const statuses = [
  { id: 's1', projectId: 'p1', name: 'Backlog', order: 1, category: 'todo' },
  {
    id: 's2',
    projectId: 'p1',
    name: 'In progress',
    order: 2,
    category: 'in_progress',
  },
] as const

const project = { id: 'p1', key: 'TOK', statuses: [...statuses] }

function task(id: string, number: number, statusId: 's1' | 's2' = 's1') {
  return {
    id,
    number,
    statusId,
    status: statuses.find((status) => status.id === statusId)!,
    completedAt: null,
  } as unknown as MovedTask
}

/** Two tasks in Backlog, TOK-1 then TOK-2. */
function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  queryClient.setQueryData(tasksKey, [task('t1', 1), task('t2', 2)])
  const announce = vi.fn()
  // isMutating as each onError sees it, to check the rollback rule.
  const pendingOnError: Array<number> = []

  function observer(id: string, number: number) {
    const options = moveTaskMutationOptions({
      queryClient,
      project,
      task: { id, number, statusId: 's1' },
      announce,
    })
    return new MutationObserver(queryClient, {
      ...options,
      onError: (...args) => {
        pendingOnError.push(
          queryClient.isMutating({ mutationKey: ['tasks', 'move'] }),
        )
        return options.onError?.(...args)
      },
    })
  }

  const cached = () =>
    (queryClient.getQueryData(tasksKey) as Array<MovedTask>).map(
      (t) => `${t.id}:${t.statusId}`,
    )

  return { queryClient, announce, pendingOnError, observer, cached }
}

/** A server call that settles when the test says so. */
function deferred() {
  let resolve!: (value: MovedTask) => void
  let reject!: (error: Error) => void
  const promise = new Promise<MovedTask>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const toInProgress: MoveRequest = { kind: 'status', statusId: 's2' }

beforeEach(() => {
  move.mockReset()
})

describe('moveTaskMutationOptions', () => {
  it('moves the card in the cache at once and announces after the server', async () => {
    const { announce, observer, cached } = setup()
    const server = deferred()
    move.mockReturnValue(server.promise)

    const done = observer('t1', 1).mutate(toInProgress)
    await vi.waitFor(() => expect(cached()).toEqual(['t2:s1', 't1:s2']))
    expect(announce).not.toHaveBeenCalled()
    expect(move).toHaveBeenCalledWith({
      data: { taskId: 't1', data: { statusId: 's2' } },
    })

    server.resolve(task('t1', 1, 's2'))
    await done
    expect(announce).toHaveBeenCalledWith('Moved TOK-1 to In progress')
  })

  it('takes the status name from the project when the result has none', async () => {
    const { announce, observer } = setup()
    move.mockResolvedValue({
      ...task('t1', 1, 's2'),
      status: undefined,
    } as never)

    await observer('t1', 1).mutate(toInProgress)

    expect(announce).toHaveBeenCalledWith('Moved TOK-1 to In progress')
  })

  it('announces a step down and a step up', async () => {
    const { announce, observer, cached } = setup()
    move.mockResolvedValue(task('t1', 1))

    await observer('t1', 1).mutate({ kind: 'down', position: 0 })
    expect(move).toHaveBeenLastCalledWith({
      data: { taskId: 't1', data: { index: 1 } },
    })
    expect(announce).toHaveBeenLastCalledWith('Moved TOK-1 down')
    expect(cached()).toEqual(['t2:s1', 't1:s1'])

    await observer('t1', 1).mutate({ kind: 'up', position: 1 })
    expect(move).toHaveBeenLastCalledWith({
      data: { taskId: 't1', data: { index: 0 } },
    })
    expect(announce).toHaveBeenLastCalledWith('Moved TOK-1 up')
  })

  it('puts the card back and announces the failure when it is the only move', async () => {
    const { announce, pendingOnError, observer, cached } = setup()
    move.mockRejectedValue(new Error('No status with id s2 in this project.'))

    await observer('t1', 1)
      .mutate(toInProgress)
      .catch(() => undefined)

    // The failing move still counts as pending inside onError.
    expect(pendingOnError).toEqual([1])
    expect(cached()).toEqual(['t1:s1', 't2:s1'])
    expect(announce).toHaveBeenCalledWith('Could not move TOK-1. Try again.')
    expect(announce).not.toHaveBeenCalledWith(expect.stringMatching(/^Moved/))
  })

  it('puts back only the failing card when one of two moves fails', async () => {
    const { queryClient, announce, pendingOnError, observer, cached } = setup()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const first = deferred()
    const second = deferred()
    move.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)

    const failing = observer('t1', 1)
      .mutate(toInProgress)
      .catch(() => undefined)
    await vi.waitFor(() => expect(cached()).toEqual(['t2:s1', 't1:s2']))
    const succeeding = observer('t2', 2).mutate(toInProgress)
    await vi.waitFor(() => expect(cached()).toEqual(['t1:s2', 't2:s2']))

    first.reject(new Error('boom'))
    await failing

    // Both moves are pending, so the snapshot, which would also undo TOK-2's
    // move, is not restored: TOK-1 alone goes back to Backlog, and the board
    // does not refetch while TOK-2's move is in flight.
    expect(pendingOnError).toEqual([2])
    expect(cached()).toEqual(['t1:s1', 't2:s2'])
    expect(announce).toHaveBeenCalledWith('Could not move TOK-1. Try again.')
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: tasksKey })

    second.resolve(task('t2', 2, 's2'))
    await succeeding
    expect(announce).toHaveBeenLastCalledWith('Moved TOK-2 to In progress')
    expect(invalidate).toHaveBeenCalledWith({ queryKey: tasksKey })
  })

  it("refreshes the board and the task's own query once settled", async () => {
    const { queryClient, observer } = setup()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    move.mockResolvedValue(task('t1', 1, 's2'))

    await observer('t1', 1).mutate(toInProgress)

    expect(invalidate).toHaveBeenCalledWith({ queryKey: tasksKey })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tasks', 't1'] })
  })
})
