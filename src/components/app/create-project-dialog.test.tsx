import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createProjectFn } from '#/fns/projects'

import { CreateProjectDialog } from './create-project-dialog'
import { LiveRegionProvider } from './live-region'

vi.mock('#/fns/projects', () => ({ createProjectFn: vi.fn() }))

const create = vi.mocked(createProjectFn)
const onCreated = vi.fn()
const onFocusCreated = vi.fn()

beforeEach(() => {
  create.mockReset()
  onCreated.mockReset()
  onFocusCreated.mockReset()
})

afterEach(cleanup)

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve))
}

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  const { container } = render(
    <QueryClientProvider client={queryClient}>
      <LiveRegionProvider>
        <CreateProjectDialog
          onCreated={onCreated}
          onFocusCreated={onFocusCreated}
        />
      </LiveRegionProvider>
    </QueryClientProvider>,
  )
  const region = container.querySelector('[aria-live]')
  if (!(region instanceof HTMLElement)) throw new Error('no live region')
  fireEvent.click(screen.getByRole('button', { name: 'New project' }))
  return region
}

function field(name: string) {
  return screen.getByRole<HTMLInputElement>('textbox', { name })
}

function type(input: HTMLInputElement, value: string) {
  fireEvent.change(input, { target: { value } })
}

async function submit() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }))
    await nextFrame()
  })
}

function project(name: string, key: string) {
  const now = new Date()
  return {
    id: `id-${key}`,
    name,
    key,
    description: null,
    color: '#2563eb',
    nextTaskNumber: 1,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    statuses: [],
  }
}

describe('CreateProjectDialog', () => {
  it('opens a dialog with name, key and colour fields', () => {
    renderDialog()

    expect(screen.getByRole('dialog', { name: 'New project' })).toBeTruthy()
    expect(field('Name (required)')).toBeTruthy()
    expect(field('Key (required)')).toBeTruthy()
    expect(
      screen.getByRole('group', { name: 'Colour (required)' }),
    ).toBeTruthy()
    expect(
      screen.getByRole<HTMLInputElement>('radio', { name: 'Blue' }).checked,
    ).toBe(true)
  })

  it('turns off browser validation and marks required inputs', () => {
    renderDialog()

    const form = field('Name (required)').closest('form')
    expect(form?.noValidate).toBe(true)
    expect(field('Name (required)').getAttribute('aria-required')).toBe('true')
    expect(field('Key (required)').getAttribute('aria-required')).toBe('true')
  })

  it('suggests the key from the name until the key is edited', () => {
    renderDialog()

    type(field('Name (required)'), 'todo Over Kill')
    expect(field('Key (required)').value).toBe('TOK')

    type(field('Key (required)'), 'abc')
    expect(field('Key (required)').value).toBe('ABC')

    type(field('Name (required)'), 'Something else')
    expect(field('Key (required)').value).toBe('ABC')
  })

  it('shows inline errors and a focused summary on an empty submit', async () => {
    renderDialog()

    await submit()

    const summary = screen.getByRole('heading', {
      name: 'Fix these fields',
    }).parentElement
    expect(document.activeElement).toBe(summary)
    expect(summary?.getAttribute('role')).toBeNull()

    const nameLink = screen.getByRole('link', {
      name: /^Name: Name is required/,
    })
    const name = field('Name (required)')
    expect(nameLink.getAttribute('href')).toBe(`#${name.id}`)
    expect(screen.getByRole('link', { name: /^Key: Key must be/ })).toBeTruthy()

    expect(name.getAttribute('aria-invalid')).toBe('true')
    const errorId = name.getAttribute('aria-describedby')
    expect(document.getElementById(errorId ?? '')?.textContent).toBe(
      'Name is required.',
    )

    fireEvent.click(nameLink)
    expect(document.activeElement).toBe(name)
    expect(create).not.toHaveBeenCalled()
  })

  it('puts a taken key on the key field', async () => {
    create.mockResolvedValue({
      ok: false,
      code: 'conflict',
      message: 'Another project already uses the key WEB.',
    })
    renderDialog()

    type(field('Name (required)'), 'Website')
    await submit()

    const key = field('Key (required)')
    expect(key.getAttribute('aria-invalid')).toBe('true')
    const ids = key.getAttribute('aria-describedby')?.split(' ') ?? []
    expect(ids.map((id) => document.getElementById(id)?.textContent)).toContain(
      'Another project already uses the key WEB.',
    )
    expect(document.activeElement?.textContent).toContain('Fix these fields')
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('shows a generic error when the server function fails', async () => {
    create.mockRejectedValue(new Error('network down'))
    renderDialog()

    type(field('Name (required)'), 'Website')
    await submit()

    expect(
      screen.getByText('Could not create the project. Try again.'),
    ).toBeTruthy()
    expect(document.activeElement?.textContent).toContain('There is a problem')
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('creates the project, announces it and closes', async () => {
    const created = project('Website', 'WEB')
    create.mockResolvedValue({ ok: true, project: created })
    const region = renderDialog()

    type(field('Name (required)'), 'Website')
    await submit()
    await act(nextFrame)

    expect(create).toHaveBeenCalledWith({
      data: { name: 'Website', key: 'WEB', color: '#2563eb' },
    })
    expect(onCreated).toHaveBeenCalledWith(created)
    expect(region.textContent).toBe('Project Website created')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onFocusCreated).toHaveBeenCalledWith(created)
  })
})
