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

// What the server function returns. Tests replace the fixture before the
// loader runs.
const server = vi.hoisted(() => {
  const state = {
    fixture: { dueToday: [] as Array<unknown>, overdue: [] as Array<unknown> },
    queryFn: vi.fn(async () => state.fixture),
  }
  return state
})

// The real key, so the page shows data only if the loader stored it there.
vi.mock('#/fns/dashboard', () => ({
  dashboardQueryOptions: (today: string) => ({
    queryKey: ['dashboard', today],
    queryFn: server.queryFn,
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

// The route's loader is a function, not the object form the option also takes.
const loader = Route.options.loader as unknown as (input: {
  context: { queryClient: QueryClient }
}) => Promise<{ today: string }>

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

  it('loads the dashboard for today into the key the page reads', async () => {
    server.fixture = { dueToday: [dueToday], overdue: [overdue] }
    const queryClient = new QueryClient()

    const result = await loader({ context: { queryClient } })

    expect(result).toEqual({ today: TODAY })
    expect(queryClient.getQueryData(['dashboard', TODAY])).toBe(server.fixture)
    expect(server.queryFn).toHaveBeenCalledTimes(1)
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

  it('says so in words when a section is empty', async () => {
    server.fixture = { dueToday: [], overdue: [] }
    await renderPage()

    expect(screen.getByText('Nothing is due today.')).toBeTruthy()
    expect(screen.getByText('Nothing is overdue.')).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
  })
})
