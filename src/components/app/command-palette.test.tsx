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
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

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

beforeAll(() => {
  // jsdom does not lay out, so it has no scrollIntoView.
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  cleanup()
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
    const listbox = within(dialog).getByRole('listbox', { name: 'Actions' })
    expect(input.getAttribute('aria-controls')).toBe(listbox.id)
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
    expect(screen.getByText('No results')).toBeTruthy()
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

    expect(fireEvent.keyDown(combobox(), { key: 'k', ctrlKey: true })).toBe(
      false,
    )
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(combobox().getAttribute('value')).toBe('help')
    expect(document.activeElement).toBe(combobox())
  })

  it('does not open while another dialog is open, nor let the browser act', async () => {
    await renderAt('/')
    const other = document.createElement('div')
    other.setAttribute('role', 'dialog')
    document.body.append(other)

    // false: the default was prevented, so focus stays in the dialog.
    expect(fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true })).toBe(
      false,
    )
    expect(screen.queryByRole('dialog', { name: 'Command menu' })).toBeNull()
    other.remove()
  })

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
})
