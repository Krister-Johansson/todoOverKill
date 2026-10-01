import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { LiveRegionProvider } from './live-region'
import { TopBar } from './top-bar'

vi.mock('#/fns/projects', () => ({
  projectQueryOptions: (id: string) => ({
    queryKey: ['projects', id],
    queryFn: vi.fn(),
  }),
}))

vi.mock('#/fns/tasks', () => ({
  createTaskFn: vi.fn(),
  tasksQueryOptions: (projectId: string) => ({
    queryKey: ['projects', projectId, 'tasks'],
  }),
}))

afterEach(cleanup)

const project = {
  id: 'p1',
  key: 'TOK',
  name: 'todoOverKill',
  statuses: [{ id: 's1', name: 'Backlog' }],
}

/** The top bar over a project route and the Settings route, at `path`. */
async function renderAt(path: string) {
  const queryClient = new QueryClient()
  // What the project layout's loader puts in the cache.
  queryClient.setQueryData(['projects', 'p1'], project)
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <TopBar currentPage="Page" />
        <Outlet />
      </>
    ),
  })
  const routeTree = rootRoute.addChildren([
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/projects/$projectId',
      component: () => <h1>Project</h1>,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/settings',
      component: () => <h1>Settings</h1>,
    }),
  ])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  render(
    <QueryClientProvider client={queryClient}>
      <LiveRegionProvider>
        <RouterProvider router={router} />
      </LiveRegionProvider>
    </QueryClientProvider>,
  )
  await screen.findByRole('heading', { level: 1 })
}

describe('TopBar', () => {
  it('shows the New task button on a project route', async () => {
    await renderAt('/projects/p1')

    fireEvent.click(screen.getByRole('button', { name: 'New task' }))
    expect(
      screen.getByRole('dialog', { name: 'New task' }).textContent,
    ).toContain('Add a task to todoOverKill.')
  })

  it('opens the dialog on c on a project route', async () => {
    await renderAt('/projects/p1')

    fireEvent.keyDown(document.body, { key: 'c' })
    expect(screen.getByRole('dialog', { name: 'New task' })).toBeTruthy()
  })

  it('has no New task button outside a project, where c opens nothing', async () => {
    await renderAt('/settings')

    expect(screen.queryByRole('button', { name: 'New task' })).toBeNull()
    fireEvent.keyDown(document.body, { key: 'c' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
