import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '@tanstack/react-router'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { formatDateTime } from '#/lib/dates'

import { RecentActivity } from './recent-activity'

import type { ComponentProps } from 'react'

afterEach(cleanup)

type Row = ComponentProps<typeof RecentActivity>['rows'][number]

const now = new Date(2026, 9, 1, 12, 0)
const website = { id: 'p1', name: 'Website', key: 'WEB' }

const moved: Row = {
  id: 'a3',
  type: 'task.moved',
  payload: { number: 7, from: 'Backlog', to: 'In progress' },
  createdAt: new Date(2026, 9, 1, 11, 55),
  project: website,
  task: { id: 't1', number: 7 },
}
const deleted: Row = {
  id: 'a2',
  type: 'task.deleted',
  payload: { number: 9, title: 'Old idea' },
  createdAt: new Date(2026, 9, 1, 10, 0),
  project: website,
  task: null,
}
const projectCreated: Row = {
  id: 'a1',
  type: 'project.created',
  payload: { name: 'Website', key: 'WEB' },
  createdAt: new Date(2026, 8, 30, 9, 0),
  project: website,
  task: null,
}

/** The section inside a small router, so its links have hrefs. */
async function renderActivity(rows: Array<Row>) {
  const rootRoute = createRootRoute({
    component: () => <RecentActivity rows={rows} now={now} />,
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(<RouterProvider router={router} />)
  await screen.findByRole('heading', { level: 2, name: 'Recent activity' })
}

function items() {
  return within(screen.getByRole('list')).getAllByRole('listitem')
}

describe('RecentActivity', () => {
  it('is a region named by its Recent activity heading', async () => {
    await renderActivity([moved])
    expect(screen.getByRole('region', { name: 'Recent activity' })).toBeTruthy()
    expect(screen.getByRole('list').tagName).toBe('OL')
  })

  it('reads reference, project and sentence, linking to the task', async () => {
    await renderActivity([moved])
    const [item] = items()
    expect(item.querySelector('p')?.textContent).toBe(
      'WEB-7, Website, Moved from Backlog to In progress.',
    )
    const link = within(item).getByRole('link', { name: 'WEB-7' })
    expect(link.getAttribute('href')).toBe('/tasks/t1')
  })

  it('shows a deleted task’s reference as text, without a link', async () => {
    await renderActivity([deleted])
    const [item] = items()
    expect(item.querySelector('p')?.textContent).toBe(
      'WEB-9, Website, Deleted the task “Old idea”.',
    )
    expect(within(item).queryByRole('link')).toBeNull()
  })

  it('shows only project and sentence for a row with no task', async () => {
    await renderActivity([projectCreated])
    const [item] = items()
    expect(item.querySelector('p')?.textContent).toBe(
      'Website, Created the project “Website”.',
    )
    expect(within(item).queryByRole('link')).toBeNull()
  })

  it('keeps the rows in the order given', async () => {
    await renderActivity([moved, deleted, projectCreated])
    expect(items().map((item) => item.querySelector('time')!.dateTime)).toEqual(
      [moved, deleted, projectCreated].map((row) =>
        row.createdAt.toISOString(),
      ),
    )
  })

  it('shows the relative and absolute time in one time element', async () => {
    await renderActivity([moved, deleted])
    const [first, second] = items().map((item) => item.querySelectorAll('time'))
    expect(first).toHaveLength(1)
    expect(first[0].getAttribute('datetime')).toBe(
      moved.createdAt.toISOString(),
    )
    expect(first[0].textContent).toBe(
      `5 minutes ago (${formatDateTime(moved.createdAt)})`,
    )
    expect(second[0].textContent).toBe(
      `2 hours ago (${formatDateTime(deleted.createdAt)})`,
    )
  })

  it('says so when there is no activity', async () => {
    await renderActivity([])
    expect(screen.getByText('No activity yet.')).toBeTruthy()
    expect(screen.queryByRole('list')).toBeNull()
  })
})
