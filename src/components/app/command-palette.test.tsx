import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
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
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { CommandPalette } from './command-palette'
import { LiveRegionProvider } from './live-region'

vi.mock('#/fns/projects', () => ({
  projectsQueryOptions: () => ({
    queryKey: ['projects'],
    queryFn: () => Promise.resolve([]),
    // The tests set the data; a refetch on mount would empty it.
    staleTime: Infinity,
  }),
}))

type Results = {
  projects: Array<{ id: string; name: string; key: string; color: null }>
  tasks: Array<{
    id: string
    number: number
    title: string
    project: { key: string; name: string }
    status: { name: string }
  }>
}

const searchMock = vi.hoisted(() =>
  vi.fn<(query: string) => Promise<Results>>(),
)

// The real query options with the server function swapped for searchMock.
vi.mock('#/fns/search', () => ({
  MIN_SEARCH_LENGTH: 2,
  MAX_SEARCH_LENGTH: 200,
  searchQueryOptions: (text: string) => ({
    queryKey: ['search', text.trim()],
    queryFn: () => searchMock(text.trim()),
    staleTime: Infinity,
  }),
}))

const NOTHING: Results = { projects: [], tasks: [] }

beforeEach(() => {
  searchMock.mockImplementation(() => Promise.resolve(NOTHING))
})

beforeAll(() => {
  // jsdom does not lay out, so it has no scrollIntoView.
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  cleanup()
  searchMock.mockReset()
  localStorage.clear()
  document.documentElement.className = ''
})

const projects = [
  { id: 'p1', name: 'Apollo' },
  { id: 'p2', name: 'Zephyr' },
]

/**
 * The palette over a few routes, with a main landmark as in the shell, at
 * `path`. `openCreateTask` stands in for the top bar's New task dialog.
 */
async function renderAt(
  path: string,
  {
    openCreateTask,
    queryClient = new QueryClient(),
  }: { openCreateTask?: () => void; queryClient?: QueryClient } = {},
) {
  // What the _app loader puts in the cache.
  queryClient.setQueryData(['projects'], projects)
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <CommandPalette openCreateTask={openCreateTask} />
        <button type="button">Elsewhere</button>
        <input aria-label="Text" />
        <main id="main" tabIndex={-1} aria-label="Content">
          <Outlet />
        </main>
      </>
    ),
  })
  const page = (name: string) => () => <h1>{name}</h1>
  const routeTree = rootRoute.addChildren(
    (
      [
        ['/', 'Dashboard'],
        ['/settings', 'Settings'],
        ['/help', 'Help'],
        ['/projects/$projectId/board', 'Board'],
        ['/tasks/$taskId', 'Task'],
      ] as const
    ).map(([routePath, name]) =>
      createRoute({
        getParentRoute: () => rootRoute,
        path: routePath,
        component: page(name),
      }),
    ),
  )
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
  return router
}

function openFromButton() {
  const trigger = screen.getByRole('button', { name: 'Search' })
  trigger.focus()
  fireEvent.click(trigger)
  return screen.getByRole('dialog', { name: 'Command menu' })
}

function combobox() {
  return screen.getByRole('combobox', { name: 'Search' })
}

function type(text: string) {
  fireEvent.change(combobox(), { target: { value: text } })
}

function press(key: string) {
  fireEvent.keyDown(combobox(), { key })
}

function activeOption() {
  const id = combobox().getAttribute('aria-activedescendant')
  return id ? document.getElementById(id) : null
}

function optionNames() {
  return screen.queryAllByRole('option').map((option) => option.textContent)
}

function groupOptions(name: string) {
  return within(screen.getByRole('group', { name }))
    .getAllByRole('option')
    .map((option) => option.textContent)
}

function wait(ms: number) {
  return act(() => new Promise((resolve) => setTimeout(resolve, ms)))
}

/** A promise the test settles by hand. */
function deferred() {
  let resolve!: (results: Results) => void
  let reject!: (error: Error) => void
  const promise = new Promise<Results>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function project(id: string, name: string, key: string) {
  return { id, name, key, color: null }
}

function task(id: string, number: number, title: string) {
  return {
    id,
    number,
    title,
    project: { key: 'APO', name: 'Apollo' },
    status: { name: 'Backlog' },
  }
}

const apolloTwo = project('p9', 'Apollo Two', 'AP2')
const launch = task('t1', 4, 'Launch plan')

/** The live region inside the dialog. */
function paletteRegion() {
  return screen
    .getByRole('dialog')
    .querySelector('[aria-live="polite"]') as HTMLElement
}

describe('CommandPalette', () => {
  it('has a combobox that controls a listbox of options', async () => {
    await renderAt('/')
    const dialog = openFromButton()

    const input = combobox()
    expect(document.activeElement).toBe(input)
    expect(input.getAttribute('aria-expanded')).toBe('true')
    expect(input.getAttribute('aria-autocomplete')).toBe('list')
    const listbox = within(dialog).getByRole('listbox', { name: 'Options' })
    expect(input.getAttribute('aria-controls')).toBe(listbox.id)
    expect(within(listbox).getByRole('group', { name: 'Actions' })).toBeTruthy()
    expect(optionNames()).toEqual([
      'Go to Dashboard',
      'Go to Settings',
      'Go to Help',
      'Switch to dark theme',
      'Go to Apollo',
      'Go to Zephyr',
    ])
    const first = screen.getAllByRole('option')[0]
    expect(activeOption()).toBe(first)
    expect(first.getAttribute('aria-selected')).toBe('true')
    // Nothing is announced on open.
    expect(paletteRegion().textContent).toBe('')
  })

  it('filters by the text and announces the count', async () => {
    await renderAt('/')
    openFromButton()

    type('GO TO ')
    expect(optionNames()).toHaveLength(5)
    await waitFor(() => expect(paletteRegion().textContent).toBe('5 options'))

    type('help')
    expect(optionNames()).toEqual(['Go to Help'])
    expect(activeOption()?.textContent).toBe('Go to Help')
    await waitFor(() => expect(paletteRegion().textContent).toBe('1 option'))

    type('nothing like this')
    expect(optionNames()).toEqual([])
    // Until the search comes back empty.
    expect(screen.getByText('Searching…')).toBeTruthy()
    expect(await screen.findByText('No results')).toBeTruthy()
    expect(combobox().getAttribute('aria-expanded')).toBe('false')
    expect(combobox().hasAttribute('aria-activedescendant')).toBe(false)
    // Hidden, not removed, so aria-controls still points at it.
    const listbox = document.getElementById(
      combobox().getAttribute('aria-controls')!,
    )
    expect(listbox?.hidden).toBe(true)
    await waitFor(() => expect(paletteRegion().textContent).toBe('No results'))
  })

  it('moves the active option with the arrows, Home and End', async () => {
    await renderAt('/')
    openFromButton()
    type('go to')

    press('ArrowDown')
    expect(activeOption()?.textContent).toBe('Go to Settings')
    press('ArrowUp')
    press('ArrowUp')
    // Wraps to the last option.
    expect(activeOption()?.textContent).toBe('Go to Zephyr')
    press('ArrowDown')
    expect(activeOption()?.textContent).toBe('Go to Dashboard')
    press('End')
    expect(activeOption()?.textContent).toBe('Go to Zephyr')
    expect(activeOption()?.getAttribute('aria-selected')).toBe('true')
    press('Home')
    expect(activeOption()?.textContent).toBe('Go to Dashboard')
  })

  it('makes the option under the pointer the active one', async () => {
    await renderAt('/')
    openFromButton()

    const help = screen.getByRole('option', { name: 'Go to Help' })
    fireEvent.pointerMove(help)
    expect(activeOption()).toBe(help)
    expect(help.getAttribute('aria-selected')).toBe('true')
    expect(
      screen
        .getAllByRole('option')
        .filter((option) => option.getAttribute('aria-selected') === 'true'),
    ).toHaveLength(1)
    // Keys carry on from the pointer's option.
    press('ArrowDown')
    expect(activeOption()?.textContent).toMatch(/^Switch to/)
  })

  it('goes to a page on Enter and moves focus to the main landmark', async () => {
    const router = await renderAt('/settings')
    openFromButton()
    type('dashboard')
    press('Enter')

    await screen.findByRole('heading', { name: 'Dashboard' })
    expect(router.state.location.pathname).toBe('/')
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('main', { name: 'Content' }),
      ),
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('goes to a project board when an option is clicked', async () => {
    const router = await renderAt('/')
    openFromButton()
    fireEvent.click(screen.getByRole('option', { name: 'Go to Zephyr' }))

    await screen.findByRole('heading', { name: 'Board' })
    expect(router.state.location.pathname).toBe('/projects/p2/board')
    await waitFor(() => expect(document.activeElement?.id).toBe('main'))
  })

  it('switches the theme, announces it and returns focus to the opener', async () => {
    await renderAt('/')
    openFromButton()
    type('theme')
    press('Enter')

    expect(document.documentElement.classList.contains('dark')).toBe(true)
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Search' }),
      ),
    )
    // The shell's region, now that the dialog no longer hides it.
    await waitFor(() =>
      expect(
        document.querySelector('body > div [aria-live="polite"]')?.textContent,
      ).toBe('Theme set to Dark'),
    )

    openFromButton()
    expect(optionNames()).toContain('Switch to light theme')
  })

  it('lists New task only when the top bar can open it', async () => {
    const openCreateTask = vi.fn()
    await renderAt('/projects/p1/board', { openCreateTask })
    openFromButton()
    expect(optionNames()[0]).toBe('New task')
    press('Enter')

    await waitFor(() => expect(openCreateTask).toHaveBeenCalledOnce())
    // Focus waits on the opener for the dialog that New task opens.
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Search' }),
    )
  })

  it('has no New task option without an opener', async () => {
    await renderAt('/')
    openFromButton()
    type('new')
    expect(optionNames()).toEqual([])
  })

  it.each([
    ['Control', { ctrlKey: true }],
    ['Command', { metaKey: true }],
  ])('opens on %s+K from the page, with no browser default', async (_, mod) => {
    await renderAt('/')
    const elsewhere = screen.getByRole('button', { name: 'Elsewhere' })
    elsewhere.focus()

    expect(fireEvent.keyDown(elsewhere, { key: 'k', ...mod })).toBe(false)
    expect(screen.getByRole('dialog', { name: 'Command menu' })).toBeTruthy()
    expect(document.activeElement).toBe(combobox())

    fireEvent.keyDown(combobox(), { key: 'Escape' })
    await waitFor(() => expect(document.activeElement).toBe(elsewhere))
  })

  it('opens on Control+K while typing in a field and returns there', async () => {
    await renderAt('/')
    const field = screen.getByRole('textbox', { name: 'Text' })
    field.focus()

    expect(fireEvent.keyDown(field, { key: 'k', ctrlKey: true })).toBe(false)
    expect(screen.getByRole('dialog', { name: 'Command menu' })).toBeTruthy()

    fireEvent.keyDown(combobox(), { key: 'Escape' })
    await waitFor(() => expect(document.activeElement).toBe(field))
  })

  it('returns focus to the Search button when opened from the page body', async () => {
    await renderAt('/')
    expect(document.activeElement).toBe(document.body)

    fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true })
    fireEvent.keyDown(combobox(), { key: 'Escape' })

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Search' }),
      ),
    )
  })

  it('ignores Control+K inside the open palette', async () => {
    await renderAt('/')
    openFromButton()
    type('help')

    // true: the default was not prevented, since nothing opened.
    expect(fireEvent.keyDown(combobox(), { key: 'k', ctrlKey: true })).toBe(
      true,
    )
    expect(screen.getByRole('dialog', { name: 'Command menu' })).toBeTruthy()
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(combobox().getAttribute('value')).toBe('help')
    expect(document.activeElement).toBe(combobox())
  })

  it.each([
    ['Control', { ctrlKey: true }],
    ['Command', { metaKey: true }],
  ])(
    'leaves %s+K its default and stays shut while another dialog is open',
    async (_, mod) => {
      await renderAt('/')
      const other = document.createElement('div')
      other.setAttribute('role', 'dialog')
      const field = document.createElement('textarea')
      other.append(field)
      document.body.append(other)
      field.focus()

      // true: the default was not prevented, so on a Mac Ctrl+K still deletes
      // to the end of the line in the field.
      expect(fireEvent.keyDown(field, { key: 'k', ...mod })).toBe(true)
      expect(screen.queryByRole('dialog', { name: 'Command menu' })).toBeNull()
      expect(document.activeElement).toBe(field)
      other.remove()
    },
  )

  it('opens on the K key of a layout without Latin letters', async () => {
    await renderAt('/')
    fireEvent.keyDown(document.body, { key: 'л', code: 'KeyK', ctrlKey: true })
    expect(screen.getByRole('dialog', { name: 'Command menu' })).toBeTruthy()
  })

  it('runs only the first of two activations', async () => {
    const router = await renderAt('/settings')
    openFromButton()
    type('go to')
    // Both land before React re-renders, as a fast Enter and click could.
    act(() => {
      press('Enter')
      fireEvent.click(screen.getByRole('option', { name: 'Go to Help' }))
    })

    await screen.findByRole('heading', { name: 'Dashboard' })
    await waitFor(() => expect(document.activeElement?.id).toBe('main'))
    expect(router.state.location.pathname).toBe('/')
  })

  it('leaves Enter to the input method while composing', async () => {
    const router = await renderAt('/settings')
    openFromButton()
    type('dashboard')
    fireEvent.keyDown(combobox(), { key: 'Enter', isComposing: true })
    fireEvent.keyDown(combobox(), { key: 'ArrowDown', isComposing: true })

    expect(screen.getByRole('dialog', { name: 'Command menu' })).toBeTruthy()
    expect(activeOption()?.textContent).toBe('Go to Dashboard')
    expect(router.state.location.pathname).toBe('/settings')
  })

  it('announces the count on screen when the delay ends', async () => {
    const queryClient = new QueryClient()
    await renderAt('/', { queryClient })
    openFromButton()
    type('go to')
    // A refetch while the delay runs adds a project.
    act(() => {
      queryClient.setQueryData(
        ['projects'],
        [...projects, { id: 'p3', name: 'Mercury' }],
      )
    })

    // Query notifies subscribers on the next tick, inside the delay.
    await waitFor(() => expect(optionNames()).toHaveLength(6))
    expect(paletteRegion().textContent).toBe('')
    await waitFor(() => expect(paletteRegion().textContent).toBe('6 options'))
  })

  it('still opens with single-key shortcuts turned off', async () => {
    localStorage.setItem('todoOverKill.shortcuts', 'off')
    await renderAt('/')

    fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true })
    expect(screen.getByRole('dialog', { name: 'Command menu' })).toBeTruthy()
  })

  describe('search results', () => {
    it('does not search under two characters', async () => {
      await renderAt('/')
      openFromButton()
      type(' g ')

      await wait(400)
      expect(searchMock).not.toHaveBeenCalled()
      expect(screen.queryByRole('group', { name: 'Tasks' })).toBeNull()
    })

    it('lists projects and tasks in named groups after the actions', async () => {
      searchMock.mockResolvedValue({ projects: [apolloTwo], tasks: [launch] })
      await renderAt('/')
      openFromButton()
      type('ap')
      type('apollo')

      await screen.findByRole('group', { name: 'Tasks' })
      // Debounced: only the last text is searched.
      expect(searchMock).toHaveBeenCalledOnce()
      expect(searchMock).toHaveBeenCalledWith('apollo')
      expect(groupOptions('Actions')).toEqual(['Go to Apollo'])
      expect(groupOptions('Projects')).toEqual(['Apollo Two, AP2'])
      expect(groupOptions('Tasks')).toEqual(['APO-4, Launch plan, Apollo'])
      expect(optionNames()).toHaveLength(3)
    })

    it('announces actions and results together, once the results arrive', async () => {
      const response = deferred()
      searchMock.mockReturnValue(response.promise)
      await renderAt('/')
      openFromButton()
      type('apollo')

      await waitFor(() => expect(searchMock).toHaveBeenCalled())
      expect(screen.getByRole('option', { name: 'Go to Apollo' })).toBeTruthy()
      await wait(400)
      // The action alone is not announced while the search is out.
      expect(paletteRegion().textContent).toBe('')

      act(() => response.resolve({ projects: [apolloTwo], tasks: [launch] }))
      await waitFor(() => expect(paletteRegion().textContent).toBe('3 options'))
    })

    it('shows Searching… while a search with nothing to show yet is out', async () => {
      searchMock.mockReturnValue(deferred().promise)
      await renderAt('/')
      openFromButton()
      type('zz')

      expect(screen.getByText('Searching…')).toBeTruthy()
      expect(screen.queryByText('No results')).toBeNull()
    })

    it('opens a task on Enter and moves focus to the main landmark', async () => {
      searchMock.mockResolvedValue({ projects: [], tasks: [launch] })
      const router = await renderAt('/settings')
      openFromButton()
      type('launch')

      await waitFor(() =>
        expect(optionNames()).toContain('APO-4, Launch plan, Apollo'),
      )
      expect(activeOption()?.textContent).toBe('APO-4, Launch plan, Apollo')
      press('Enter')

      await screen.findByRole('heading', { name: 'Task' })
      expect(router.state.location.pathname).toBe('/tasks/t1')
      await waitFor(() => expect(document.activeElement?.id).toBe('main'))
    })

    it('goes to the board of a project result', async () => {
      searchMock.mockResolvedValue({ projects: [apolloTwo], tasks: [] })
      const router = await renderAt('/')
      openFromButton()
      type('apollo')

      await screen.findByRole('group', { name: 'Projects' })
      press('ArrowDown')
      expect(activeOption()?.textContent).toBe('Apollo Two, AP2')
      press('Enter')

      await screen.findByRole('heading', { name: 'Board' })
      expect(router.state.location.pathname).toBe('/projects/p9/board')
    })

    it('moves across the groups with the arrows and wraps', async () => {
      searchMock.mockResolvedValue({ projects: [apolloTwo], tasks: [launch] })
      await renderAt('/')
      openFromButton()
      type('apollo')
      await screen.findByRole('group', { name: 'Tasks' })

      press('ArrowDown')
      press('ArrowDown')
      expect(activeOption()?.textContent).toBe('APO-4, Launch plan, Apollo')
      press('ArrowDown')
      expect(activeOption()?.textContent).toBe('Go to Apollo')
      press('ArrowUp')
      expect(activeOption()?.textContent).toBe('APO-4, Launch plan, Apollo')
      press('Home')
      expect(activeOption()?.textContent).toBe('Go to Apollo')
    })

    it('keeps the active result when the results change, or falls back to the first', async () => {
      searchMock.mockResolvedValue({ projects: [apolloTwo], tasks: [launch] })
      const queryClient = new QueryClient()
      await renderAt('/', { queryClient })
      openFromButton()
      type('apollo')
      await screen.findByRole('group', { name: 'Tasks' })
      press('End')
      expect(activeOption()?.textContent).toBe('APO-4, Launch plan, Apollo')

      // A refetch puts another result above the active one.
      act(() => {
        queryClient.setQueryData(['search', 'apollo'], {
          projects: [apolloTwo, project('p8', 'Apollo Three', 'AP3')],
          tasks: [launch],
        })
      })
      await waitFor(() => expect(optionNames()).toContain('Apollo Three, AP3'))
      expect(activeOption()?.textContent).toBe('APO-4, Launch plan, Apollo')

      // The active result is gone, so the first option is active.
      act(() => {
        queryClient.setQueryData(['search', 'apollo'], {
          projects: [apolloTwo],
          tasks: [],
        })
      })
      await waitFor(() =>
        expect(screen.queryByRole('group', { name: 'Tasks' })).toBeNull(),
      )
      expect(activeOption()?.textContent).toBe('Go to Apollo')
      expect(
        screen
          .getAllByRole('option')
          .filter((option) => option.getAttribute('aria-selected') === 'true'),
      ).toHaveLength(1)
    })

    it('never lets a slow response for older text replace newer results', async () => {
      const slow = deferred()
      searchMock.mockImplementation((query) =>
        query === 'laun'
          ? slow.promise
          : Promise.resolve({ projects: [], tasks: [launch] }),
      )
      await renderAt('/')
      openFromButton()
      type('laun')
      await waitFor(() => expect(searchMock).toHaveBeenCalledWith('laun'))
      type('launch')

      await waitFor(() =>
        expect(optionNames()).toContain('APO-4, Launch plan, Apollo'),
      )
      act(() =>
        slow.resolve({ projects: [], tasks: [task('t2', 9, 'Laundry')] }),
      )
      await wait(50)
      expect(optionNames()).toEqual(['APO-4, Launch plan, Apollo'])
      await waitFor(() => expect(paletteRegion().textContent).toBe('1 option'))
    })

    it('shows and announces a failed search and keeps the actions', async () => {
      searchMock.mockRejectedValue(new Error('Network down'))
      await renderAt('/')
      openFromButton()
      type('go')

      await screen.findByText('Search failed. Try again.')
      await waitFor(() =>
        expect(paletteRegion().textContent).toBe('Search failed. Try again.'),
      )
      expect(screen.getByRole('dialog', { name: 'Command menu' })).toBeTruthy()
      expect(optionNames()).toHaveLength(5)
      expect(screen.queryByRole('group', { name: 'Tasks' })).toBeNull()
    })

    it('lists a result that comes back twice once', async () => {
      searchMock.mockResolvedValue({
        projects: [apolloTwo, apolloTwo],
        tasks: [launch, launch],
      })
      await renderAt('/')
      openFromButton()
      type('apollo')

      await screen.findByRole('group', { name: 'Tasks' })
      expect(groupOptions('Projects')).toHaveLength(1)
      expect(groupOptions('Tasks')).toHaveLength(1)
    })
  })
})
