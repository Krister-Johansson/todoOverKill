import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '@tanstack/react-router'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { TaskCard, TaskCardContent, taskCardId } from './task-card'

afterEach(cleanup)

const project = { name: 'Website', key: 'WEB' }

function task(
  overrides: Partial<Parameters<typeof TaskCardContent>[0]['task']> = {},
) {
  return {
    number: 7,
    title: 'Fix the footer',
    priority: 'high' as const,
    dueDate: '2026-10-01',
    completedAt: null as Date | null,
    labels: [
      { id: 'l1', name: 'Bug', color: '#dc2626' },
      { id: 'l2', name: 'Design', color: '#2563eb' },
    ],
    ...overrides,
  }
}

function renderCard(
  overrides: Parameters<typeof task>[0] = {},
  today = '2026-10-02',
) {
  return render(
    <div data-testid="card">
      <TaskCardContent task={task(overrides)} project={project} today={today} />
    </div>,
  )
}

describe('TaskCardContent', () => {
  it('shows the task reference as an abbreviation naming the project', () => {
    renderCard()
    const reference = screen.getByText('WEB-7')
    expect(reference.tagName).toBe('ABBR')
    expect(reference.getAttribute('title')).toContain('Website')
  })

  it('shows the title and the priority as text', () => {
    renderCard()
    expect(screen.getByText('Fix the footer')).toBeTruthy()
    expect(screen.getByText('High')).toBeTruthy()
  })

  it('shows the due date and Overdue once the day has passed', () => {
    renderCard()
    const time = screen.getByText('Oct 1, 2026')
    expect(time.tagName).toBe('TIME')
    expect(time.getAttribute('datetime')).toBe('2026-10-01')
    expect(time.parentElement?.textContent).toBe('Due Oct 1, 2026')
    expect(screen.getByText('Overdue')).toBeTruthy()
  })

  it('is not overdue on the due day itself', () => {
    renderCard({}, '2026-10-01')
    expect(screen.queryByText('Overdue')).toBeNull()
  })

  it('is not overdue once completed', () => {
    renderCard({ completedAt: new Date('2026-09-30T12:00:00Z') })
    expect(screen.getByText('Oct 1, 2026')).toBeTruthy()
    expect(screen.queryByText('Overdue')).toBeNull()
  })

  it('shows no date without a due date', () => {
    renderCard({ dueDate: null })
    expect(screen.getByTestId('card').querySelector('time')).toBeNull()
    expect(screen.queryByText('Overdue')).toBeNull()
  })

  it('lists the labels', () => {
    renderCard()
    const items = within(screen.getByRole('list')).getAllByRole('listitem')
    // Each chip starts with a comma that only screen readers get.
    expect(items.map((item) => item.textContent)).toEqual([', Bug', ', Design'])
  })

  it('separates the parts of the link name with commas', () => {
    renderCard()
    expect(screen.getByTestId('card').textContent).toBe(
      'WEB-7, Fix the footer, High, Due Oct 1, 2026, Overdue, Bug, Design',
    )
  })

  it('renders no list without labels', () => {
    renderCard({ labels: [] })
    expect(screen.queryByRole('list')).toBeNull()
  })
})

describe('TaskCard', () => {
  it('gives the link the id from taskCardId', async () => {
    const rootRoute = createRootRoute({
      component: () => (
        <ul>
          <TaskCard
            task={{ ...task(), id: 'task-1' }}
            project={project}
            today="2026-10-02"
          />
        </ul>
      ),
    })
    const router = createRouter({
      routeTree: rootRoute,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    render(<RouterProvider router={router} />)

    const link = await screen.findByRole('link')
    expect(link.id).toBe(taskCardId('task-1'))
    expect(taskCardId('task-1')).not.toBe(taskCardId('task-2'))
  })
})
