import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { formatDateTime } from '#/lib/dates'

import { ActivityLog } from './activity-log'

afterEach(cleanup)

const now = new Date(2026, 9, 1, 12, 0)
const created = new Date(2026, 9, 1, 10, 0)
const moved = new Date(2026, 9, 1, 11, 55)
// Written after the page loaded, so it is newer than `now`.
const completed = new Date(2026, 9, 1, 12, 0, 30)

const rows = [
  {
    id: 'a1',
    type: 'task.created',
    payload: { number: 7, title: 'Fix the footer' },
    createdAt: created,
  },
  {
    id: 'a2',
    type: 'task.moved',
    payload: { number: 7, from: 'Backlog', to: 'In progress' },
    createdAt: moved,
  },
  {
    id: 'a3',
    type: 'task.completed',
    payload: { number: 7 },
    createdAt: completed,
  },
]

function items() {
  return within(screen.getByRole('list')).getAllByRole('listitem')
}

describe('ActivityLog', () => {
  it('is a region named by its Activity heading', () => {
    render(<ActivityLog rows={rows} now={now} headingLevel={3} />)
    expect(
      screen.getByRole('heading', { level: 3, name: 'Activity' }),
    ).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Activity' })).toBeTruthy()
  })

  it('shows one sentence per row in the order given', () => {
    render(<ActivityLog rows={rows} now={now} />)
    expect(screen.getByRole('list').tagName).toBe('OL')
    expect(items().map((item) => item.querySelector('p')?.textContent)).toEqual(
      [
        'Created the task “Fix the footer”.',
        'Moved from Backlog to In progress.',
        'Completed the task.',
      ],
    )
  })

  it('shows the relative and absolute time in a time element', () => {
    render(<ActivityLog rows={rows} now={now} />)
    const times = items().map((item) => item.querySelector('time')!)
    expect(times.map((time) => time.getAttribute('datetime'))).toEqual(
      rows.map((row) => row.createdAt.toISOString()),
    )
    expect(times[0].textContent).toBe(
      `2 hours ago (${formatDateTime(created)})`,
    )
    expect(times[1].textContent).toBe(
      `5 minutes ago (${formatDateTime(moved)})`,
    )
  })

  it('says just now for a row newer than now', () => {
    render(<ActivityLog rows={rows} now={now} />)
    expect(items()[2].querySelector('time')!.textContent).toBe(
      `just now (${formatDateTime(completed)})`,
    )
  })

  it('says so when there is no activity', () => {
    render(<ActivityLog rows={[]} now={now} />)
    expect(screen.getByText('No activity yet')).toBeTruthy()
    expect(screen.queryByRole('list')).toBeNull()
  })
})
