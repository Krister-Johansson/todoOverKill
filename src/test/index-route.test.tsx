import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Route } from '#/routes/_app/index'

// What the server functions return. Tests replace the fixtures before the
// loader runs.
const server = vi.hoisted(() => {
  const state = {
    fixture: { dueToday: [] as Array<unknown>, overdue: [] as Array<unknown> },
    activity: [] as Array<unknown>,
    progress: [] as Array<unknown>,
    queryFn: vi.fn(async () => state.fixture),
    activityFn: vi.fn(async () => state.activity),
    progressFn: vi.fn(async () => state.progress),
  }
  return state
})

// The real keys, so the page shows data only if the loader stored it there.
vi.mock('#/fns/dashboard', () => ({
  dashboardQueryOptions: (today: string) => ({
    queryKey: ['dashboard', today],
    queryFn: server.queryFn,
  }),
  recentActivityQueryOptions: () => ({
    queryKey: ['dashboard', 'activity'],
    queryFn: server.activityFn,
  }),
  projectProgressQueryOptions: () => ({
    queryKey: ['dashboard', 'progress'],
    queryFn: server.progressFn,
  }),
}))

const TODAY = '2026-10-02'

beforeEach(() => {
  // Only Date is faked, so the router's timers still run.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 2, 12))
  // The router restores scroll on load; jsdom has no scrollTo.
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  server.queryFn.mockClear()
  server.activityFn.mockClear()
  server.progressFn.mockClear()
  server.activity = []
  server.progress = []
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const website = { id: 'p1', name: 'Website', key: 'WEB' }
const shop = { id: 'p2', name: 'Shop', key: 'SHOP' }

function dashboardTask(
  overrides: {
    id: string
    number: number
    title: string
    dueDate: string
    project: typeof website
  } & Partial<{ priority: 'low' | 'medium' | 'high' | 'urgent' }>,
) {
  return {
    projectId: overrides.project.id,
    statusId: 's1',
    description: null,
    priority: 'medium' as const,
    order: 1,
    completedAt: null,
    createdAt: new Date('2026-09-01T09:00:00.000Z'),
    updatedAt: new Date('2026-09-01T09:00:00.000Z'),
    status: { id: 's1', name: 'Backlog', category: 'todo' },
    labels: [],
    ...overrides,
  }
}

const dueToday = dashboardTask({
  id: 't1',
  number: 3,
  title: 'Send the newsletter',
  dueDate: TODAY,
  project: website,
  priority: 'high',
})
const overdue = dashboardTask({
  id: 't2',
  number: 9,
  title: 'Fix the checkout',
  dueDate: '2026-09-28',
  project: shop,
  priority: 'urgent',
})

const moved = {
  id: 'a2',
  type: 'task.moved',
  payload: { number: 3, from: 'Backlog', to: 'In progress' },
  createdAt: new Date(2026, 9, 2, 10),
  project: website,
  task: { id: 't1', number: 3 },
}
const deleted = {
  id: 'a1',
  type: 'task.deleted',
  payload: { number: 4, title: 'Old idea' },
  createdAt: new Date(2026, 9, 1, 12),
  project: shop,
  task: null,
}

// The route's loader is a function, not the object form the option also takes.
const loader = Route.options.loader as unknown as (input: {
  context: { queryClient: QueryClient }
}) => Promise<{ today: string; now: string }>

/**
 * The page in a small tree with the real loader and component on '/', under
 * an `_app` layout as in the app, and a task route for the links.
 */
async function renderPage(queryClient = new QueryClient()) {
  const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()()
  const appRoute = createRoute({ getParentRoute: () => rootRoute, id: '_app' })
  const routeTree = rootRoute.addChildren([
    appRoute.addChildren([
      createRoute({
        getParentRoute: () => appRoute,
        path: '/',
        loader: ({ context }) => loader({ context }),
        component: Route.options.component,
      }),
      createRoute({ getParentRoute: () => appRoute, path: 'tasks/$taskId' }),
      createRoute({
        getParentRoute: () => appRoute,
        path: 'projects/$projectId/board',
      }),
    ]),
  ])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
    context: { queryClient },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  await screen.findByRole('heading', { level: 1, name: 'Dashboard' })
}

describe('index route', () => {
  it('names itself Dashboard for the breadcrumb', () => {
    expect(Route.options.staticData?.title).toBe('Dashboard')
  })

  it('loads the dashboard for today into the keys the page reads', async () => {
    server.fixture = { dueToday: [dueToday], overdue: [overdue] }
    server.activity = [moved]
    server.progress = [{ ...website, total: 3, done: 1 }]
    const queryClient = new QueryClient()

    const result = await loader({ context: { queryClient } })

    expect(result).toEqual({
      today: TODAY,
      now: new Date(2026, 9, 2, 12).toISOString(),
    })
    expect(queryClient.getQueryData(['dashboard', TODAY])).toBe(server.fixture)
    expect(queryClient.getQueryData(['dashboard', 'activity'])).toBe(
      server.activity,
    )
    expect(queryClient.getQueryData(['dashboard', 'progress'])).toBe(
      server.progress,
    )
    expect(server.queryFn).toHaveBeenCalledTimes(1)
    expect(server.activityFn).toHaveBeenCalledTimes(1)
    expect(server.progressFn).toHaveBeenCalledTimes(1)
  })

  it('serves cached data at once and refetches it in the background', async () => {
    const queryClient = new QueryClient()
    await loader({ context: { queryClient } })
    const cached = server.progress
    // A task completed elsewhere: the server now has new progress.
    server.progress = [{ ...website, total: 3, done: 2 }]
    // A refetch that never settles, so the loader can only resolve if it does
    // not wait for it.
    server.progressFn.mockImplementationOnce(() => new Promise(() => {}))

    await loader({ context: { queryClient } })

    expect(queryClient.getQueryData(['dashboard', 'progress'])).toBe(cached)
    expect(server.queryFn).toHaveBeenCalledTimes(2)
    expect(server.activityFn).toHaveBeenCalledTimes(2)
    expect(server.progressFn).toHaveBeenCalledTimes(2)

    await queryClient.refetchQueries({ queryKey: ['dashboard', 'progress'] })
    expect(queryClient.getQueryData(['dashboard', 'progress'])).toEqual(
      server.progress,
    )
  })

  it('lists the tasks due today and the overdue ones as links', async () => {
    server.fixture = { dueToday: [dueToday], overdue: [overdue] }
    await renderPage()

    expect(server.queryFn).toHaveBeenCalledTimes(1)
    const today = screen.getByRole('region', { name: 'Due today' })
    const late = screen.getByRole('region', { name: 'Overdue' })
    expect(
      within(today).getByRole('heading', { level: 2, name: 'Due today' }),
    ).toBeTruthy()
    expect(
      within(late).getByRole('heading', { level: 2, name: 'Overdue' }),
    ).toBeTruthy()

    const todayLink = within(today).getByRole('link')
    expect(todayLink.getAttribute('href')).toBe('/tasks/t1')
    expect(todayLink.textContent).toBe(
      'WEB-3, Send the newsletter, Website, High, Due Oct 2, 2026',
    )
    expect(within(today).queryByText('Overdue')).toBeNull()

    const lateLink = within(late).getByRole('link')
    expect(lateLink.getAttribute('href')).toBe('/tasks/t2')
    expect(lateLink.textContent).toBe(
      'SHOP-9, Fix the checkout, Shop, Urgent, Due Sep 28, 2026, Overdue',
    )
  })

  it('shows recent activity, linking to tasks that still exist', async () => {
    server.activity = [moved, deleted]
    await renderPage()

    const region = screen.getByRole('region', { name: 'Recent activity' })
    expect(
      within(region).getByRole('heading', {
        level: 2,
        name: 'Recent activity',
      }),
    ).toBeTruthy()
    const [movedItem, deletedItem] = within(region).getAllByRole('listitem')
    expect(movedItem.querySelector('p')?.textContent).toBe(
      'WEB-3, Website, Moved from Backlog to In progress.',
    )
    expect(
      within(movedItem)
        .getByRole('link', { name: 'WEB-3' })
        .getAttribute('href'),
    ).toBe('/tasks/t1')
    expect(movedItem.querySelector('time')?.textContent).toMatch(
      /^2 hours ago \(.+\)$/,
    )
    expect(deletedItem.querySelector('p')?.textContent).toBe(
      'SHOP-4, Shop, Deleted the task “Old idea”.',
    )
    expect(within(deletedItem).queryByRole('link')).toBeNull()
  })

  it('lists each project with a link to its board and its progress', async () => {
    server.progress = [{ ...website, total: 21, done: 7 }]
    await renderPage()

    const region = screen.getByRole('region', { name: 'Projects' })
    expect(
      within(region).getByRole('heading', { level: 2, name: 'Projects' }),
    ).toBeTruthy()
    const link = within(region).getByRole('link', { name: 'Website' })
    expect(link.getAttribute('href')).toBe('/projects/p1/board')
    expect(within(region).getByText('7 of 21 tasks done')).toBeTruthy()
  })

  it('says so in words when a section is empty', async () => {
    server.fixture = { dueToday: [], overdue: [] }
    await renderPage()

    expect(screen.getByText('Nothing is due today.')).toBeTruthy()
    expect(screen.getByText('Nothing is overdue.')).toBeTruthy()
    expect(screen.getByText('No activity yet.')).toBeTruthy()
    expect(screen.getByText('No projects yet.')).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
  })
})
