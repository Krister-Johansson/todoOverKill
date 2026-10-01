import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Route } from '#/routes/_app/tasks.$taskId'

vi.mock('#/fns/tasks', () => ({
  taskQueryOptions: (id: string) => ({ queryKey: ['tasks', id] }),
}))

vi.mock('#/fns/projects', () => ({
  projectQueryOptions: (id: string) => ({ queryKey: ['projects', id] }),
}))

beforeEach(() => {
  // The router restores scroll on load; jsdom has no scrollTo.
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  // jsdom has no ResizeObserver, which the Markdown code blocks use.
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
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const project = { id: 'p1', name: 'Website', key: 'WEB' }
const task = {
  id: 't1',
  projectId: 'p1',
  number: 7,
  title: 'Fix the footer',
  description: 'Some **bold** words.',
  priority: 'high' as const,
  dueDate: null,
  completedAt: null,
  createdAt: new Date(2026, 8, 20, 9, 30),
  updatedAt: new Date(2026, 8, 25, 16, 45),
  status: { name: 'Backlog' },
  labels: [],
}

type HeadInput = Parameters<NonNullable<typeof Route.options.head>>[0]

function title(loaderData: unknown) {
  const head = Route.options.head!({ loaderData } as HeadInput) as {
    meta: Array<{ title: string }>
  }
  return head.meta[0]?.title
}

/**
 * The page in a small tree whose ids match the real one, so the route's own
 * hooks find their match. The query client holds the task and project the
 * real loader would have fetched.
 */
async function renderPage() {
  const queryClient = new QueryClient()
  queryClient.setQueryData(['tasks', task.id], task)
  queryClient.setQueryData(['projects', project.id], project)
  const rootRoute = createRootRoute()
  const appRoute = createRoute({ getParentRoute: () => rootRoute, id: '_app' })
  const routeTree = rootRoute.addChildren([
    appRoute.addChildren([
      createRoute({
        getParentRoute: () => appRoute,
        path: 'tasks/$taskId',
        loader: () => ({ today: '2026-10-01' }),
        component: Route.options.component,
      }),
      createRoute({
        getParentRoute: () => appRoute,
        path: 'projects/$projectId/board',
      }),
    ]),
  ])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [`/tasks/${task.id}`] }),
  })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  await screen.findByRole('heading', { level: 1 })
}

describe('task route', () => {
  it('is titled Task in the top bar', () => {
    expect(Route.options.staticData?.title).toBe('Task')
  })

  it('names the task and the project in the document title', () => {
    expect(title({ task, project, today: '2026-10-01' })).toBe(
      'Fix the footer · Website · todoOverKill',
    )
    expect(title(undefined)).toBe('Task · todoOverKill')
  })

  it('shows the reference and title as the heading, then the detail', async () => {
    await renderPage()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'WEB-7 Fix the footer',
    )
    expect(
      screen.getByRole('heading', { level: 2, name: 'Description' }),
    ).toBeTruthy()
    expect(screen.getByText('bold').tagName).toBe('STRONG')
  })
})
