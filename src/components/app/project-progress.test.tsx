import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '@tanstack/react-router'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { ProjectProgress, progressText } from './project-progress'

import type { ComponentProps } from 'react'

afterEach(cleanup)

type Row = ComponentProps<typeof ProjectProgress>['rows'][number]

/** The section inside a small router, so its links have hrefs. */
async function renderProgress(rows: Array<Row>) {
  const rootRoute = createRootRoute({
    component: () => <ProjectProgress rows={rows} />,
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(<RouterProvider router={router} />)
  await screen.findByRole('heading', { level: 2, name: 'Projects' })
}

describe('progressText', () => {
  it('counts done tasks out of all of them', () => {
    expect(progressText(21, 7)).toBe('7 of 21 tasks done')
    expect(progressText(2, 0)).toBe('0 of 2 tasks done')
  })

  it('says task for a project with one task', () => {
    expect(progressText(1, 1)).toBe('1 of 1 task done')
  })

  it('says so when a project has no tasks', () => {
    expect(progressText(0, 0)).toBe('No tasks yet')
  })
})

describe('ProjectProgress', () => {
  it('lists each project as a link to its board with its progress', async () => {
    await renderProgress([
      { id: 'p1', name: 'Website', key: 'WEB', total: 21, done: 7 },
      { id: 'p2', name: 'Shop', key: 'SHOP', total: 0, done: 0 },
    ])
    expect(screen.getByRole('region', { name: 'Projects' })).toBeTruthy()
    const [website, shop] = within(screen.getByRole('list')).getAllByRole(
      'listitem',
    )
    const link = within(website).getByRole('link', { name: 'Website' })
    expect(link.getAttribute('href')).toBe('/projects/p1/board')
    expect(within(website).getByText('7 of 21 tasks done')).toBeTruthy()
    expect(within(shop).getByText('No tasks yet')).toBeTruthy()
  })

  it('says so when there are no projects', async () => {
    await renderProgress([])
    expect(screen.getByText('No projects yet.')).toBeTruthy()
    expect(screen.queryByRole('list')).toBeNull()
  })
})
