import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { addSubtaskFn, deleteSubtaskFn, updateSubtaskFn } from '#/fns/subtasks'

import { LiveRegionProvider } from './live-region'
import { SubtaskList } from './subtask-list'

import type { Subtask } from './subtask-list'

vi.mock('#/fns/subtasks', () => ({
  subtasksQueryOptions: (id: string) => ({
    queryKey: ['tasks', id, 'subtasks'],
    // A refetch never lands, so the cache shows what the component wrote.
    queryFn: () => new Promise(() => {}),
  }),
  addSubtaskFn: vi.fn(),
  updateSubtaskFn: vi.fn(),
  deleteSubtaskFn: vi.fn(),
}))

vi.mock('#/fns/tasks', () => ({
  taskActivityQueryOptions: (id: string) => ({
    queryKey: ['tasks', id, 'activity'],
  }),
}))

const add = vi.mocked(addSubtaskFn)
const update = vi.mocked(updateSubtaskFn)
const remove = vi.mocked(deleteSubtaskFn)
const subtasksKey = ['tasks', 't1', 'subtasks']

function row(id: string, title: string, done = false): Subtask {
  return {
    id,
    taskId: 't1',
    title,
    done,
    order: Number(id.slice(1)),
  }
}

/** A promise and the functions that settle it, to hold a request open. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

let queryClient: QueryClient

function renderList(rows: Array<Subtask>) {
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { staleTime: Infinity, retry: false },
      mutations: { retry: false },
    },
  })
  queryClient.setQueryData(subtasksKey, rows)
  render(
    <QueryClientProvider client={queryClient}>
      <LiveRegionProvider>
        <SubtaskList taskId="t1" />
      </LiveRegionProvider>
    </QueryClientProvider>,
  )
  return screen.getByRole('region', { name: 'Subtasks' })
}

function liveRegion() {
  return document.querySelector('[aria-live="polite"]')!
}

async function expectAnnounced(message: string) {
  await waitFor(() => expect(liveRegion().textContent).toBe(message))
}

function checkbox(name: string) {
  return screen.getByRole('checkbox', { name })
}

function cached() {
  return queryClient.getQueryData<Array<Subtask>>(subtasksKey)
}

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe('SubtaskList', () => {
  it('lists the subtasks as labelled checkboxes with a count line', () => {
    const region = renderList([row('s1', 'Find', true), row('s2', 'Fix')])

    expect(
      within(region).getByRole('heading', { level: 2, name: 'Subtasks' }),
    ).toBeTruthy()
    expect(within(region).getByText('1 of 2 done')).toBeTruthy()
    expect(checkbox('Find').getAttribute('aria-checked')).toBe('true')
    expect(checkbox('Fix').getAttribute('aria-checked')).toBe('false')
    // Each button's name starts with its visible word.
    expect(screen.getByRole('button', { name: 'Edit Find' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Delete Fix' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'New subtask' })).toBeTruthy()
  })

  it('says so when there are no subtasks', () => {
    const region = renderList([])

    expect(within(region).getByText('No subtasks yet')).toBeTruthy()
    expect(within(region).queryByRole('list')).toBeNull()
  })

  it('adds a subtask, keeps focus in the input and announces it', async () => {
    renderList([row('s1', 'Find')])
    add.mockResolvedValue(row('s2', 'Fix'))
    const input = screen.getByRole('textbox', { name: 'New subtask' })

    input.focus()
    fireEvent.change(input, { target: { value: '  Fix ' } })
    fireEvent.submit(input.closest('form')!)

    await waitFor(() =>
      expect(add).toHaveBeenCalledWith({
        data: { taskId: 't1', data: { title: '  Fix ' } },
      }),
    )
    await expectAnnounced('Subtask Fix added')
    expect(checkbox('Fix')).toBeTruthy()
    expect(screen.getByText('0 of 2 done')).toBeTruthy()
    expect((input as HTMLInputElement).value).toBe('')
    expect(document.activeElement).toBe(input)
  })

  it('refuses an empty title without a request', () => {
    renderList([])
    const input = screen.getByRole('textbox', { name: 'New subtask' })

    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.submit(input.closest('form')!)

    expect(add).not.toHaveBeenCalled()
    expect(input.getAttribute('aria-invalid')).toBe('true')
    const error = document.getElementById(
      input.getAttribute('aria-describedby')!,
    )
    expect(error?.textContent).toBe('Title is required.')
    expect(document.activeElement).toBe(input)
  })

  it('keeps the text and announces a failed add', async () => {
    renderList([])
    add.mockRejectedValue(new Error('down'))
    const input = screen.getByRole('textbox', { name: 'New subtask' })

    fireEvent.change(input, { target: { value: 'Fix' } })
    fireEvent.submit(input.closest('form')!)

    await expectAnnounced('Could not add the subtask. Try again.')
    expect((input as HTMLInputElement).value).toBe('Fix')
  })

  it('checks a subtask at once and announces it once saved', async () => {
    renderList([row('s1', 'Find')])
    const request = deferred<Subtask>()
    update.mockReturnValue(request.promise)

    fireEvent.click(checkbox('Find'))

    await waitFor(() =>
      expect(checkbox('Find').getAttribute('aria-checked')).toBe('true'),
    )
    expect(update).toHaveBeenCalledWith({
      data: { subtaskId: 's1', data: { done: true } },
    })
    expect(screen.getByText('1 of 1 done')).toBeTruthy()
    await act(async () => request.resolve(row('s1', 'Find', true)))
    await expectAnnounced('Subtask Find done')
  })

  it('announces a subtask that is no longer done', async () => {
    renderList([row('s1', 'Find', true)])
    update.mockResolvedValue(row('s1', 'Find', false))

    fireEvent.click(checkbox('Find'))

    await expectAnnounced('Subtask Find not done')
    expect(checkbox('Find').getAttribute('aria-checked')).toBe('false')
  })

  it('rolls back only the failed row and announces the failure', async () => {
    renderList([row('s1', 'Find'), row('s2', 'Fix')])
    const failing = deferred<Subtask>()
    const passing = deferred<Subtask>()
    update.mockImplementation(({ data }) =>
      data.subtaskId === 's1' ? failing.promise : passing.promise,
    )
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const listRefetches = () =>
      invalidate.mock.calls.filter(
        ([filters]) => filters?.queryKey?.at(-1) === 'subtasks',
      ).length

    fireEvent.click(checkbox('Find'))
    fireEvent.click(checkbox('Fix'))
    await waitFor(() =>
      expect(cached()?.map((subtask) => subtask.done)).toEqual([true, true]),
    )

    await act(async () => failing.reject(new Error('refused')))
    await expectAnnounced('Could not save subtask Find. Try again.')
    expect(checkbox('Find').getAttribute('aria-checked')).toBe('false')
    // The other row's toggle is still in flight and keeps its new state.
    expect(checkbox('Fix').getAttribute('aria-checked')).toBe('true')
    // A refetch now would undo the pending toggle until its write lands.
    expect(listRefetches()).toBe(0)
    await act(async () => passing.resolve(row('s2', 'Fix', true)))
    await expectAnnounced('Subtask Fix done')
    expect(listRefetches()).toBe(1)
  })

  it('ignores a second toggle of a row while the first is saving', async () => {
    renderList([row('s1', 'Find')])
    update.mockReturnValue(deferred<Subtask>().promise)

    fireEvent.click(checkbox('Find'))
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    fireEvent.click(checkbox('Find'))

    await expectAnnounced(
      'Subtask Find is still saving. Try again in a moment.',
    )
    expect(update).toHaveBeenCalledTimes(1)
    expect(checkbox('Find').getAttribute('aria-checked')).toBe('true')
  })

  it('renames a subtask and returns focus to its Edit button', async () => {
    renderList([row('s1', 'Find')])
    update.mockResolvedValue(row('s1', 'Find the cause'))

    fireEvent.click(screen.getByRole('button', { name: 'Edit Find' }))
    const input = screen.getByRole('textbox', { name: 'Title' })
    expect(document.activeElement).toBe(input)
    expect((input as HTMLInputElement).value).toBe('Find')
    fireEvent.change(input, { target: { value: 'Find the cause' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        data: { subtaskId: 's1', data: { title: 'Find the cause' } },
      }),
    )
    await expectAnnounced('Subtask renamed to Find the cause')
    const edit = screen.getByRole('button', { name: 'Edit Find the cause' })
    expect(document.activeElement).toBe(edit)
    expect(screen.queryByRole('textbox', { name: 'Title' })).toBeNull()
  })

  it('cancels a rename with Escape and returns focus to Edit', () => {
    renderList([row('s1', 'Find')])

    fireEvent.click(screen.getByRole('button', { name: 'Edit Find' }))
    const input = screen.getByRole('textbox', { name: 'Title' })
    fireEvent.change(input, { target: { value: 'Other' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(update).not.toHaveBeenCalled()
    expect(screen.queryByRole('textbox', { name: 'Title' })).toBeNull()
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Edit Find' }),
    )
    expect(checkbox('Find')).toBeTruthy()
  })

  it('saves an unchanged title without a request', () => {
    renderList([row('s1', 'Find')])

    fireEvent.click(screen.getByRole('button', { name: 'Edit Find' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(update).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Edit Find' }),
    )
  })

  it('shows an empty rename as an error and keeps editing', () => {
    renderList([row('s1', 'Find')])

    fireEvent.click(screen.getByRole('button', { name: 'Edit Find' }))
    const input = screen.getByRole('textbox', { name: 'Title' })
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(update).not.toHaveBeenCalled()
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText('Title is required.')).toBeTruthy()
    expect(document.activeElement).toBe(input)
  })

  describe('delete', () => {
    async function deleteRow(title: string) {
      const button = screen.getByRole('button', { name: `Delete ${title}` })
      button.focus()
      fireEvent.click(button)
      await expectAnnounced(`Subtask ${title} deleted`)
    }

    it('moves focus to the next row', async () => {
      renderList([row('s1', 'Find'), row('s2', 'Fix'), row('s3', 'Ship')])
      remove.mockResolvedValue(row('s2', 'Fix'))

      await deleteRow('Fix')

      expect(remove).toHaveBeenCalledWith({ data: 's2' })
      expect(screen.queryByRole('checkbox', { name: 'Fix' })).toBeNull()
      expect(document.activeElement).toBe(checkbox('Ship'))
      expect(screen.getByText('0 of 2 done')).toBeTruthy()
    })

    it('moves focus to the previous row when the last row goes', async () => {
      renderList([row('s1', 'Find'), row('s2', 'Fix')])
      remove.mockResolvedValue(row('s2', 'Fix'))

      await deleteRow('Fix')

      expect(document.activeElement).toBe(checkbox('Find'))
    })

    it('moves focus to the New subtask input when the list empties', async () => {
      renderList([row('s1', 'Find')])
      remove.mockResolvedValue(row('s1', 'Find'))

      await deleteRow('Find')

      expect(screen.getByText('No subtasks yet')).toBeTruthy()
      expect(document.activeElement).toBe(
        screen.getByRole('textbox', { name: 'New subtask' }),
      )
    })

    it('keeps the row and announces a failed delete', async () => {
      renderList([row('s1', 'Find')])
      remove.mockRejectedValue(new Error('down'))

      fireEvent.click(screen.getByRole('button', { name: 'Delete Find' }))

      await expectAnnounced('Could not delete subtask Find. Try again.')
      expect(checkbox('Find')).toBeTruthy()
    })
  })
})
