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
  within,
} from '@testing-library/react'
import { useRef, useState } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { LiveRegionProvider } from './live-region'
import { TopBar } from './top-bar'

const fetchProject = vi.hoisted(() => vi.fn())

vi.mock('#/fns/projects', () => ({
  projectsQueryOptions: () => ({
    queryKey: ['projects'],
    queryFn: () => Promise.resolve([]),
  }),
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

beforeAll(() => {
  // jsdom does not lay out, so it has no scrollIntoView, which the command
  // menu calls on its active option.
  Element.prototype.scrollIntoView = vi.fn()
})

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

/** The top bar with the assistant state the shell keeps. */
function TopBarWithAssistant() {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  return (
    <TopBar
      currentPage="Page"
      assistantOpen={open}
      onAssistantToggle={() => setOpen((value) => !value)}
      assistantButtonRef={buttonRef}
    />
  )
}

/** The top bar over a project route and the Settings route, at `path`. */
async function renderAt(path: string) {
  const queryClient = new QueryClient()
  // What the project layout's loader puts in the cache.
  queryClient.setQueryData(['projects', 'p1'], project)
  queryClient.setQueryData(['projects'], [project])
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <TopBarWithAssistant />
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
  it('toggles aria-expanded on the Assistant button', async () => {
    await renderAt('/settings')

    const button = screen.getByRole('button', { name: 'Assistant' })
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(button.getAttribute('aria-controls')).toBeNull()
    expect(button.getAttribute('aria-keyshortcuts')).toBe('a')
    fireEvent.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(button.getAttribute('aria-controls')).toBe('assistant-panel')
  })

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

  it('opens the command menu from the Search button on any route', async () => {
    await renderAt('/settings')

    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    const dialog = screen.getByRole('dialog', { name: 'Command menu' })
    expect(within(dialog).getByRole('combobox', { name: 'Search' })).toBe(
      document.activeElement,
    )
    expect(
      within(dialog).queryByRole('option', { name: 'New task' }),
    ).toBeNull()
  })

  it('opens the New task dialog from the command menu on a project route', async () => {
    await renderAt('/projects/p1')

    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    fireEvent.click(screen.getByRole('option', { name: 'New task' }))

    const dialog = await screen.findByRole('dialog', { name: 'New task' })
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(dialog).getByRole('textbox', { name: 'Title (required)' }),
      ),
    )
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
