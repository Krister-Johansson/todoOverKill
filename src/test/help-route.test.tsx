import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Route } from '#/routes/_app/help'

beforeEach(() => {
  // The router restores scroll on load; jsdom has no scrollTo.
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/**
 * The page uses router Links, which throw outside a router. A small tree with
 * /help and /settings is enough; the real tree would run the _app loader.
 */
async function renderPage() {
  const rootRoute = createRootRoute()
  const routeTree = rootRoute.addChildren([
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/help',
      component: Route.options.component,
    }),
    createRoute({ getParentRoute: () => rootRoute, path: '/settings' }),
  ])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/help'] }),
  })
  render(<RouterProvider router={router} />)
  await screen.findByRole('heading', { level: 1, name: 'Help' })
}

describe('help route', () => {
  it('has Glossary, Keyboard shortcuts and Browser support sections', async () => {
    await renderPage()

    expect(
      screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent),
    ).toEqual(['Glossary', 'Keyboard shortcuts', 'Browser support'])
    for (const name of ['Glossary', 'Keyboard shortcuts', 'Browser support']) {
      expect(screen.getByRole('region', { name })).toBeTruthy()
    }
  })

  it('links to each section from the contents list', async () => {
    await renderPage()

    const contents = screen.getByRole('navigation', { name: 'On this page' })
    expect(
      within(contents)
        .getAllByRole('link')
        .map((link) => [link.textContent, link.getAttribute('href')]),
    ).toEqual([
      ['Glossary', '/help#glossary'],
      ['Keyboard shortcuts', '/help#shortcuts'],
      ['Browser support', '/help#browsers'],
    ])
  })

  it('defines every glossary term, including those in 3.1.3', async () => {
    await renderPage()

    const glossary = screen.getByRole('region', { name: 'Glossary' })
    const terms = Array.from(glossary.querySelectorAll('dt'))
    expect(terms.length).toBeGreaterThan(0)
    for (const term of terms) {
      expect(term.id).toBeTruthy()
      expect(term.nextElementSibling?.tagName).toBe('DD')
      expect(term.nextElementSibling?.textContent.trim()).toBeTruthy()
    }
    const names = terms.map((term) => term.textContent)
    for (const name of [
      'Backlog',
      'Priority',
      'Label',
      'Assistant',
      'WebMCP',
    ]) {
      expect(names).toContain(name)
    }
    expect(new Set(terms.map((term) => term.id)).size).toBe(terms.length)
  })

  it('shows the shortcuts in a captioned table and marks the later ones', async () => {
    await renderPage()

    const table = screen.getByRole('table', { name: 'Keys and what they do' })
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Keys', 'What it does'])
    for (const row of within(table).getAllByRole('row').slice(1)) {
      expect(
        row.querySelectorAll('kbd[data-slot="kbd"]').length,
      ).toBeGreaterThan(0)
    }
    expect(
      within(table).getAllByText(
        'Not available yet. Arrives in a later release.',
      ),
    ).toHaveLength(2)
    expect(
      screen.getByRole('link', { name: 'Settings' }).getAttribute('href'),
    ).toBe('/settings')
  })

  it('says voice and WebMCP need Chrome and that audio may go to Google', async () => {
    await renderPage()

    const browsers = screen.getByRole('region', { name: 'Browser support' })
    expect(browsers.textContent).toMatch(/Voice and WebMCP work only in Chrome/)
    expect(browsers.textContent).toMatch(/hides the voice and WebMCP controls/)
    expect(browsers.textContent).toMatch(
      /send the sound of your voice to Google/,
    )
  })

  it('names itself Help for the breadcrumb', () => {
    expect(Route.options.staticData?.title).toBe('Help')
  })
})
