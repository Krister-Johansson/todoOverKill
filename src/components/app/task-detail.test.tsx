import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '@tanstack/react-router'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { formatDateTime } from '#/lib/dates'

import { TaskDetail } from './task-detail'

import type { DetailTask } from './task-detail'

// jsdom has no ResizeObserver, which the Markdown code blocks use.
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const project = { id: 'p1', name: 'Website', key: 'WEB' }
const createdAt = new Date(2026, 8, 20, 9, 30)
const updatedAt = new Date(2026, 8, 25, 16, 45)

function task(overrides: Partial<DetailTask> = {}): DetailTask {
  return {
    number: 7,
    title: 'Fix the footer',
    description: 'Some **bold** words.\n\n# Steps',
    priority: 'high',
    dueDate: '2026-10-01',
    completedAt: null,
    createdAt,
    updatedAt,
    status: { name: 'In progress' },
    labels: [
      { id: 'l1', name: 'Bug', color: '#dc2626' },
      { id: 'l2', name: 'Design', color: '#2563eb' },
    ],
    ...overrides,
  }
}

/** Renders the detail in a router, for the project board link. */
async function renderDetail(
  overrides: Partial<DetailTask> = {},
  today = '2026-10-02',
) {
  const rootRoute = createRootRoute({
    component: () => (
      <TaskDetail task={task(overrides)} project={project} today={today} />
    ),
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(<RouterProvider router={router} />)
  await screen.findByRole('heading', { name: 'Description' })
}

/** The dd that follows the dt with this text. */
function field(term: string) {
  const dt = screen.getByText(term, { selector: 'dt' })
  const dd = dt.nextElementSibling
  if (!dd) throw new Error(`No value for ${term}`)
  return dd as HTMLElement
}

describe('TaskDetail', () => {
  it('shows the reference as an abbreviation naming the project', async () => {
    await renderDetail()
    const reference = screen.getByText('WEB-7')
    expect(reference.tagName).toBe('ABBR')
    expect(reference.getAttribute('title')).toBe('Website task WEB-7')
  })

  it('links to the project board', async () => {
    await renderDetail()
    expect(
      screen.getByRole('link', { name: 'Website' }).getAttribute('href'),
    ).toBe('/projects/p1/board')
  })

  it('shows the status, the priority and the labels as text', async () => {
    await renderDetail()
    expect(field('Status').textContent).toBe('In progress')
    expect(field('Priority').textContent).toBe('High')
    const labels = field('Labels').querySelectorAll('li')
    expect([...labels].map((label) => label.textContent)).toEqual([
      'Bug',
      'Design',
    ])
    expect(
      [...labels].map(
        (label) =>
          label.querySelector<HTMLElement>('.border-2')?.style.borderColor,
      ),
    ).toEqual(['rgb(220, 38, 38)', 'rgb(37, 99, 235)'])
  })

  it('says when there are no labels and no due date', async () => {
    await renderDetail({ labels: [], dueDate: null })
    expect(field('Labels').textContent).toBe('No labels')
    expect(field('Due date').textContent).toBe('No due date')
  })

  it('marks a past due date Overdue', async () => {
    await renderDetail()
    const due = field('Due date')
    expect(due.querySelector('time')?.getAttribute('datetime')).toBe(
      '2026-10-01',
    )
    expect(due.textContent).toBe('Oct 1, 2026Overdue')
  })

  it('is not overdue on the due day', async () => {
    await renderDetail({}, '2026-10-01')
    expect(field('Due date').textContent).toBe('Oct 1, 2026')
  })

  it('is never overdue once completed', async () => {
    const completedAt = new Date(2026, 9, 2, 8, 0)
    await renderDetail({ completedAt })
    expect(field('Due date').textContent).toBe('Oct 1, 2026')
    const completed = field('Completed').querySelector('time')
    expect(completed?.textContent).toBe(formatDateTime(completedAt))
    expect(completed?.getAttribute('datetime')).toBe(completedAt.toISOString())
  })

  it('shows the created and updated times', async () => {
    await renderDetail()
    const created = field('Created').querySelector('time')
    expect(created?.textContent).toBe(formatDateTime(createdAt))
    expect(created?.getAttribute('datetime')).toBe(createdAt.toISOString())
    expect(field('Updated').textContent).toBe(formatDateTime(updatedAt))
  })

  it('leaves out Completed for an open task', async () => {
    await renderDetail()
    expect(screen.queryByText('Completed', { selector: 'dt' })).toBeNull()
  })

  it('renders the description as Markdown under its heading', async () => {
    await renderDetail()
    expect(
      screen.getByRole('heading', { name: 'Description', level: 2 }),
    ).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Description' })).toBeTruthy()
    expect(screen.getByText('bold').tagName).toBe('STRONG')
    expect(
      screen.getByRole('heading', { name: 'Steps', level: 3 }),
    ).toBeTruthy()
  })

  it('says when there is no description', async () => {
    await renderDetail({ description: null })
    expect(screen.getByText('No description')).toBeTruthy()
  })

  it('shows raw HTML as text and drops javascript: links', async () => {
    await renderDetail({
      description: '<b>not bold</b> and [run](javascript:alert(1))',
    })
    const section = screen.getByRole('region', { name: 'Description' })
    expect(section.querySelector('b')).toBeNull()
    expect(section.textContent).toContain('<b>not bold</b>')
    expect(screen.queryByRole('link', { name: 'run' })).toBeNull()
    expect(screen.getByText('run')).toBeTruthy()
  })
})
