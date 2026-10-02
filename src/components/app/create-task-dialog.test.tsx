import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createTaskFn } from '#/fns/tasks'

import { CreateTaskDialog } from './create-task-dialog'
import { LiveRegionProvider } from './live-region'
import { taskCardId } from './task-card'

import type { CreateTaskResult } from '#/fns/tasks'

vi.mock('#/fns/tasks', () => ({
  createTaskFn: vi.fn(),
  tasksQueryOptions: (projectId: string) => ({
    queryKey: ['projects', projectId, 'tasks'],
  }),
}))

vi.mock('#/fns/projects', () => ({
  projectQueryOptions: (id: string) => ({ queryKey: ['projects', id] }),
}))

type CreatedTask = Extract<CreateTaskResult, { ok: true }>['task']

const create = vi.mocked(createTaskFn)
const tasksKey = ['projects', 'p1', 'tasks']

const project = {
  id: 'p1',
  key: 'TOK',
  name: 'todoOverKill',
  statuses: [
    { id: 's1', name: 'Backlog' },
    { id: 's2', name: 'In progress' },
  ],
}

beforeEach(() => {
  create.mockReset()
})

afterEach(() => {
  cleanup()
  localStorage.clear()
})

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve))
}

function task(overrides: Partial<CreatedTask> = {}) {
  const now = new Date()
  return {
    id: 't12',
    projectId: 'p1',
    statusId: 's2',
    number: 12,
    title: 'Write copy',
    description: null,
    priority: 'high',
    dueDate: '2026-10-01',
    order: 1,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    status: { id: 's2', name: 'In progress' },
    labels: [],
    ...overrides,
  } as unknown as CreatedTask
}

function renderDialog({ open = true }: { open?: boolean } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  const existing = task({ id: 't1', number: 1, title: 'Existing' })
  queryClient.setQueryData(tasksKey, [existing])
  const { container } = render(
    <QueryClientProvider client={queryClient}>
      <LiveRegionProvider>
        <input aria-label="Search" />
        <CreateTaskDialog project={project} />
      </LiveRegionProvider>
    </QueryClientProvider>,
  )
  const region = container.querySelector('[aria-live]')
  if (!(region instanceof HTMLElement)) throw new Error('no live region')
  if (open) fireEvent.click(trigger())
  return { region, queryClient }
}

function trigger() {
  return screen.getByRole('button', { name: 'New task' })
}

function title() {
  return screen.getByRole<HTMLInputElement>('textbox', {
    name: 'Title (required)',
  })
}

function dueDate() {
  return screen.getByLabelText<HTMLInputElement>('Due date')
}

/** The text of the elements an input's aria-describedby names. */
function description(input: HTMLElement) {
  return (input.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .map((id) => document.getElementById(id)?.textContent)
    .join(' ')
}

/** What Chrome reports for a date with no year: an empty, bad value. */
function typePartOfADate(input: HTMLInputElement) {
  Object.defineProperty(input, 'validity', {
    configurable: true,
    value: { badInput: true, valid: false },
  })
}

function errorSummary() {
  const summary = screen.getByRole('heading', {
    name: /Fix these fields|There is a problem/,
  }).parentElement
  if (!summary) throw new Error('no summary')
  return summary
}

function select(name: string) {
  return screen.getByRole<HTMLSelectElement>('combobox', { name })
}

async function submit() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }))
    await nextFrame()
  })
}

/** Presses `c` and returns whether its default was prevented. */
function pressC(target: Element) {
  return !fireEvent.keyDown(target, { key: 'c' })
}

describe('CreateTaskDialog', () => {
  it('opens a dialog with the task fields and no project field', () => {
    renderDialog()

    const dialog = screen.getByRole('dialog', { name: 'New task' })
    expect(dialog.textContent).toContain('Add a task to todoOverKill.')
    expect(title().value).toBe('')
    expect(screen.getByRole('textbox', { name: 'Description' })).toBeTruthy()
    expect(select('Status').value).toBe('s1')
    expect(select('Priority').selectedOptions[0].textContent).toBe(
      'No priority',
    )
    expect(screen.getByLabelText('Due date').getAttribute('type')).toBe('date')
    const labels = screen.getByRole('group', { name: 'Labels' })
    expect(labels.hasAttribute('disabled')).toBe(true)
    expect(labels.textContent).toContain('Labels arrive in a later release.')
    expect(screen.queryByRole('combobox', { name: /project/i })).toBeNull()
  })

  it('opens on c with an empty title and prevents the default', () => {
    renderDialog({ open: false })

    expect(pressC(trigger())).toBe(true)

    expect(screen.getByRole('dialog', { name: 'New task' })).toBeTruthy()
    expect(title().value).toBe('')
  })

  it('does not open on c in a text field', () => {
    renderDialog({ open: false })

    expect(pressC(screen.getByRole('textbox', { name: 'Search' }))).toBe(false)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('does not reopen or reset on c while it is open', () => {
    renderDialog()
    fireEvent.change(title(), { target: { value: 'Draft' } })
    const cancel = screen.getByRole('button', { name: 'Cancel' })

    expect(pressC(cancel)).toBe(false)

    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(title().value).toBe('Draft')
  })

  it('does not open on c when shortcuts are off', () => {
    localStorage.setItem('todoOverKill.shortcuts', 'off')
    renderDialog({ open: false })

    pressC(trigger())
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows an inline error and a focused summary on an empty submit', async () => {
    renderDialog()

    await submit()

    const summary = screen.getByRole('heading', {
      name: 'Fix these fields',
    }).parentElement
    expect(document.activeElement).toBe(summary)
    const link = screen.getByRole('link', {
      name: 'Title: Title is required.',
    })
    expect(link.getAttribute('href')).toBe(`#${title().id}`)
    expect(title().getAttribute('aria-invalid')).toBe('true')
    const errorId = title().getAttribute('aria-describedby')
    expect(document.getElementById(errorId ?? '')?.textContent).toBe(
      'Title is required.',
    )

    fireEvent.click(link)
    expect(document.activeElement).toBe(title())
    expect(create).not.toHaveBeenCalled()
  })

  it('describes the due date in the order and format of the locale', () => {
    renderDialog()

    // jsdom's navigator.language is en-US, which Chrome shows as mm/dd/yyyy.
    expect(navigator.language).toBe('en-US')
    expect(description(dueDate())).toBe(
      'Optional. Month, day and year, such as 10/01/2026.',
    )
  })

  it('blocks a partly typed due date with one error linked from the summary', async () => {
    renderDialog()
    fireEvent.change(title(), { target: { value: 'Write copy' } })
    typePartOfADate(dueDate())

    await submit()

    expect(document.activeElement).toBe(errorSummary())
    const links = screen.getAllByRole('link', { name: /^Due date:/ })
    expect(links).toHaveLength(1)
    expect(links[0].textContent).toBe(
      'Due date: Enter the whole date, with day, month and year, or clear the field.',
    )
    expect(links[0].getAttribute('href')).toBe(`#${dueDate().id}`)
    expect(dueDate().getAttribute('aria-invalid')).toBe('true')
    expect(description(dueDate())).toContain(
      'Enter the whole date, with day, month and year, or clear the field.',
    )
    expect(create).not.toHaveBeenCalled()

    fireEvent.click(links[0])
    expect(document.activeElement).toBe(dueDate())
  })

  it('lists a partly typed due date beside other field errors', async () => {
    renderDialog()
    typePartOfADate(dueDate())

    await submit()

    expect(
      Array.from(
        errorSummary().querySelectorAll('a'),
        (a) => a.textContent.split(':')[0],
      ),
    ).toEqual(['Title', 'Due date'])
    expect(create).not.toHaveBeenCalled()
  })

  it('creates the task once the due date is complete again', async () => {
    create.mockResolvedValue({ ok: true, task: task() })
    renderDialog()
    fireEvent.change(title(), { target: { value: 'Write copy' } })
    typePartOfADate(dueDate())
    await submit()
    expect(create).not.toHaveBeenCalled()

    // Back to the input's own validity, then a whole date.
    Reflect.deleteProperty(dueDate(), 'validity')
    fireEvent.change(dueDate(), { target: { value: '2026-10-01' } })
    await submit()

    expect(create).toHaveBeenCalledOnce()
    expect(create.mock.calls[0][0].data.data.dueDate).toBe('2026-10-01')
  })

  it('drops the due date error as soon as the partly typed date is cleared', async () => {
    renderDialog()
    fireEvent.change(title(), { target: { value: 'Write copy' } })
    typePartOfADate(dueDate())
    await submit()

    // Another digit that still leaves the year out keeps the error.
    fireEvent.keyUp(dueDate(), { key: '1' })
    expect(dueDate().getAttribute('aria-invalid')).toBe('true')
    expect(screen.getAllByRole('link', { name: /^Due date:/ })).toHaveLength(1)

    // Chrome sends neither input nor change while the value stays '', so
    // clearing the segments is seen on the key.
    Reflect.deleteProperty(dueDate(), 'validity')
    fireEvent.keyUp(dueDate(), { key: 'Backspace' })

    expect(dueDate().getAttribute('aria-invalid')).toBeNull()
    expect(description(dueDate())).not.toContain('Enter the whole date')
    expect(screen.queryByRole('link', { name: /^Due date:/ })).toBeNull()
    expect(
      screen.queryByRole('heading', { name: 'Fix these fields' }),
    ).toBeNull()
    expect(create).not.toHaveBeenCalled()
  })

  it.each([
    ['status', 'That status no longer exists; choose another.'],
    [
      'project',
      'This project no longer exists, so the task cannot be added to it. Close this dialog.',
    ],
    ['label', 'Could not create the task. Try again.'],
  ] as const)(
    'shows its own message in the focused summary for a missing %s',
    async (entity, message) => {
      create.mockResolvedValue({
        ok: false,
        code: 'not_found',
        entity,
        message: `No ${entity} with id x1.`,
      })
      renderDialog()

      fireEvent.change(title(), { target: { value: 'Write copy' } })
      await submit()

      expect(document.activeElement).toBe(errorSummary())
      expect(document.activeElement?.textContent).toBe(
        `There is a problem${message}`,
      )
      expect(screen.getByRole('dialog')).toBeTruthy()
    },
  )

  it('shows a conflict in the focused summary', async () => {
    create.mockResolvedValue({
      ok: false,
      code: 'conflict',
      message: 'The project has no statuses. Add a status first.',
    })
    renderDialog()

    fireEvent.change(title(), { target: { value: 'Write copy' } })
    await submit()

    expect(document.activeElement?.textContent).toContain('There is a problem')
    expect(document.activeElement?.textContent).toContain(
      'The project has no statuses. Add a status first.',
    )
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('shows a generic error in the same summary when the server fails', async () => {
    create.mockRejectedValue(new Error('Connection lost.'))
    const { queryClient } = renderDialog()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    fireEvent.change(title(), { target: { value: 'Write copy' } })
    await submit()

    expect(document.activeElement?.textContent).toContain('There is a problem')
    expect(document.activeElement?.textContent).toContain(
      'Could not create the task. Try again.',
    )
    expect(screen.getByRole('dialog')).toBeTruthy()
    // So a deleted status leaves the select before the next try, and only
    // the project: the board's task list under its key is left alone.
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['projects', 'p1'],
      exact: true,
    })
    expect(queryClient.getQueryState(tasksKey)?.isInvalidated).toBe(false)
  })

  it('sends a current status after a refetch drops the chosen one', async () => {
    create.mockResolvedValueOnce({
      ok: false,
      code: 'not_found',
      entity: 'status',
      message: 'No status with id s2 in this project.',
    })
    create.mockResolvedValueOnce({ ok: true, task: task({ statusId: 's1' }) })
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    })
    const ui = (statuses: typeof project.statuses) => (
      <QueryClientProvider client={queryClient}>
        <LiveRegionProvider>
          <CreateTaskDialog project={{ ...project, statuses }} />
        </LiveRegionProvider>
      </QueryClientProvider>
    )
    const { rerender } = render(ui(project.statuses))
    fireEvent.click(trigger())

    fireEvent.change(title(), { target: { value: 'Write copy' } })
    fireEvent.change(select('Status'), { target: { value: 's2' } })
    await submit()
    expect(create.mock.calls[0][0].data.data.statusId).toBe('s2')

    // The project refetch after the failure no longer has "In progress".
    const remaining = [project.statuses[0], { id: 's3', name: 'Done' }]
    rerender(ui(remaining))
    expect(select('Status').value).toBe('s1')

    await submit()
    expect(create.mock.calls[1][0].data.data.statusId).toBe('s1')
  })

  it('stays open with the typed values while a create is in flight', async () => {
    let finish: (result: CreateTaskResult) => void = () => undefined
    create.mockReturnValue(
      new Promise<CreateTaskResult>((resolve) => {
        finish = resolve
      }),
    )
    renderDialog()

    fireEvent.change(title(), { target: { value: 'Write copy' } })
    await submit()
    expect(screen.getByRole('button', { name: 'Creating task…' })).toBeTruthy()

    fireEvent.keyDown(title(), { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await act(nextFrame)
    expect(screen.getByRole('dialog', { name: 'New task' })).toBeTruthy()
    expect(title().value).toBe('Write copy')

    await act(async () => {
      finish({ ok: true, task: task() })
      await nextFrame()
    })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('creates one task when submitted twice in quick succession', async () => {
    let finish: (result: CreateTaskResult) => void = () => undefined
    create.mockReturnValue(
      new Promise<CreateTaskResult>((resolve) => {
        finish = resolve
      }),
    )
    renderDialog()
    fireEvent.change(title(), { target: { value: 'Write copy' } })
    const button = screen.getByRole('button', { name: 'Create task' })
    const form = button.closest('form')
    if (!form) throw new Error('no form')

    await act(async () => {
      // Both before React renders the submitting state.
      fireEvent.submit(form)
      fireEvent.submit(form)
      await nextFrame()
    })
    expect(button.getAttribute('aria-disabled')).toBe('true')
    await act(async () => {
      fireEvent.click(button)
      await nextFrame()
    })
    expect(create).toHaveBeenCalledOnce()

    await act(async () => {
      finish({ ok: true, task: task() })
      await nextFrame()
    })
    expect(create).toHaveBeenCalledOnce()
  })

  it('creates the task, updates the cache, announces it and focuses the card', async () => {
    const created = task()
    create.mockResolvedValue({ ok: true, task: created })
    const { region, queryClient } = renderDialog()
    const card = document.createElement('a')
    card.id = taskCardId(created.id)
    card.href = '#card'
    document.body.append(card)

    fireEvent.change(title(), { target: { value: 'Write copy' } })
    fireEvent.change(select('Status'), { target: { value: 's2' } })
    fireEvent.change(select('Priority'), { target: { value: 'high' } })
    fireEvent.change(screen.getByLabelText('Due date'), {
      target: { value: '2026-10-01' },
    })
    await submit()
    await act(nextFrame)

    expect(create).toHaveBeenCalledWith({
      data: {
        projectId: 'p1',
        data: {
          title: 'Write copy',
          description: undefined,
          statusId: 's2',
          priority: 'high',
          dueDate: '2026-10-01',
        },
      },
    })
    expect(
      queryClient
        .getQueryData<Array<CreatedTask>>(tasksKey)
        ?.map(({ id }) => id),
    ).toEqual(['t1', 't12'])
    expect(region.textContent).toBe('Task TOK-12 created')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(card)
    card.remove()
  })

  it('focuses the trigger when no card appears', async () => {
    create.mockResolvedValue({ ok: true, task: task() })
    renderDialog()

    fireEvent.change(title(), { target: { value: 'Write copy' } })
    await submit()
    await act(nextFrame)

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })

  it('returns focus to the trigger on Escape', async () => {
    renderDialog()

    fireEvent.keyDown(title(), { key: 'Escape' })
    await act(nextFrame)

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })
})
