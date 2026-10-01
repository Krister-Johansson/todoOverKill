import {
  QueryClient,
  QueryClientProvider,
  focusManager,
} from '@tanstack/react-query'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { LiveRegionProvider } from './live-region'
import { TopBar } from './top-bar'

const fetchProject = vi.hoisted(() => vi.fn())

vi.mock('#/fns/projects', () => ({
  projectQueryOptions: (id: string) => ({
    queryKey: ['projects', id],
    queryFn: fetchProject,
  }),
}))

vi.mock('#/fns/tasks', () => ({
  createTaskFn: vi.fn(),
  tasksQueryOptions: (projectId: string) => ({
    queryKey: ['projects', projectId, 'tasks'],
  }),
}))

afterEach(() => {
  cleanup()
  fetchProject.mockReset()
  focusManager.setFocused(undefined)
})

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
  return queryClient
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

  it('fetches a project missing from the cache once, without retries or a refetch on focus', async () => {
    fetchProject.mockRejectedValue(new Error('No project with id gone.'))
    const queryClient = await renderAt('/projects/gone')

    // With retries the query stays pending for seconds of backoff.
    await waitFor(() =>
      expect(queryClient.getQueryState(['projects', 'gone'])?.status).toBe(
        'error',
      ),
    )
    expect(fetchProject).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'New task' })).toBeNull()

    // Leaving the window and coming back does not ask again.
    act(() => {
      focusManager.setFocused(false)
      focusManager.setFocused(true)
    })
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
    expect(fetchProject).toHaveBeenCalledOnce()
  })

  it('does not fetch a project the loader already cached', async () => {
    await renderAt('/projects/p1')

    expect(fetchProject).not.toHaveBeenCalled()
  })
})
