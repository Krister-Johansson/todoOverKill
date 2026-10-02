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
    expect(within(contents).getAllByRole('listitem')).toHaveLength(3)
    expect(contents.querySelector('ul')?.getAttribute('role')).toBe('list')
    expect(
      within(contents)
        .getAllByRole('link')
        .map((link) => [link.textContent, link.getAttribute('href')]),
    ).toEqual([
      ['Glossary', '#glossary'],
      ['Keyboard shortcuts', '#shortcuts'],
      ['Browser support', '#browsers'],
    ])
  })

  it('defines every glossary term, including those in 3.1.3', async () => {
    await renderPage()

    const glossary = screen.getByRole('region', { name: 'Glossary' })
    const terms = Array.from(glossary.querySelectorAll('dt'))
    expect(terms.length).toBeGreaterThan(0)
    for (const term of terms) {
      expect(term.id).toMatch(/^term-[a-z-]+$/)
      expect(term.nextElementSibling?.tagName).toBe('DD')
      expect(term.nextElementSibling?.textContent.trim()).toBeTruthy()
    }
    const names = terms.map((term) => term.textContent)
    for (const name of [
      'Backlog',
      'Command menu',
      'Priority',
      'Label',
      'Assistant',
      'WebMCP',
    ]) {
      expect(names).toContain(name)
    }
    expect(new Set(terms.map((term) => term.id)).size).toBe(terms.length)
    expect(document.getElementById('term-backlog')?.textContent).toBe('Backlog')
  })

  it('uses the word overdue and spells out abbreviations (3.1.4)', async () => {
    await renderPage()

    const definitionOf = (id: string) =>
      document.getElementById(id)?.nextElementSibling?.textContent ?? ''
    expect(definitionOf('term-due-date')).toContain('overdue')
    expect(definitionOf('term-mcp')).toContain('AI (artificial intelligence)')
    expect(definitionOf('term-rest-api')).toContain(
      'Representational State Transfer Application Programming Interface',
    )
  })

  it('marks glossary terms for features that have not shipped', async () => {
    await renderPage()

    const definitionOf = (id: string) =>
      document.getElementById(id)?.nextElementSibling?.textContent ?? ''
    expect(definitionOf('term-voice')).toContain(
      'Not available yet. Arrives in a later release.',
    )
    // F38 shipped the text assistant.
    expect(definitionOf('term-assistant')).not.toContain('Not available yet')
    expect(definitionOf('term-backlog')).not.toContain('Not available yet')
    expect(definitionOf('term-command-menu')).not.toContain('Not available yet')
    // F66 added search results to the command menu.
    expect(definitionOf('term-command-menu')).toContain(
      'tasks by title or reference',
    )
    // F30 shipped the project and status endpoints.
    expect(definitionOf('term-rest-api')).not.toContain('Not available yet')
    // F35 shipped the MCP server's read tools and F36 its write tools.
    expect(definitionOf('term-mcp')).not.toContain('Not available yet')
    expect(definitionOf('term-mcp')).toContain(
      'They can read and change projects, tasks, subtasks, labels and comments. Before an AI tool deletes or archives something, it must ask you first.',
    )
    expect(definitionOf('term-mcp')).not.toContain('later release')
  })

  it('shows the shortcuts in a captioned table and marks the later ones', async () => {
    await renderPage()

    const table = screen.getByRole('table', { name: 'Keys and what they do' })
    // If the table overflows, the keyboard can focus and scroll its container.
    const container = screen.getByRole('region', {
      name: 'Keyboard shortcuts table',
    })
    expect(container.contains(table)).toBe(true)
    expect(container.getAttribute('tabindex')).toBe('0')
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
    // F65 shipped the command menu, the last shortcut with the note.
    expect(
      within(table).queryAllByText(
        'Not available yet. Arrives in a later release.',
      ),
    ).toHaveLength(0)
    expect(
      screen.getByRole('link', { name: 'Settings' }).getAttribute('href'),
    ).toBe('/settings')
  })

  it('shows how the keys of each row are pressed', async () => {
    await renderPage()

    const table = screen.getByRole('table', { name: 'Keys and what they do' })
    const keysCell = (action: string) => {
      const row = within(table).getByText(action).closest('tr')
      return row!.querySelector('td')!
    }

    // A chord is a nested kbd with + between the caps.
    const chord = keysCell('Go back to the one before.')
    expect(chord.textContent).toBe('Shift+Tab')
    expect(chord.querySelector('kbd[data-slot="kbd-group"]')).not.toBeNull()

    // A sequence and a choice are separate caps, joined by words.
    const sequence = keysCell(
      'From the top of a page, the first Tab shows "Skip to content". Enter then jumps past the menu to the page.',
    )
    expect(sequence.textContent).toBe('Tab then Enter')
    expect(sequence.querySelector('kbd[data-slot="kbd-group"]')).toBeNull()

    const choice = keysCell(
      'Pick an option in a group, such as Theme in Settings.',
    )
    expect(choice.querySelector('kbd[data-slot="kbd-group"]')).toBeNull()
    // Each arrow glyph is hidden from screen readers and named in text.
    expect(
      Array.from(choice.querySelectorAll('[aria-hidden="true"]')).map(
        (glyph) => glyph.textContent,
      ),
    ).toEqual(['↑', '↓', '←', '→'])
    expect(
      Array.from(choice.querySelectorAll('.sr-only')).map(
        (name) => name.textContent,
      ),
    ).toEqual(['Up arrow', 'Down arrow', 'Left arrow', 'Right arrow'])
    // jsdom's name computation trims the " or " joiners, so the cell's full
    // accessible name is checked in tests/e2e/help.spec.ts instead.

    expect(keysCell('Close a dialog or the assistant panel.').textContent).toBe(
      'Escape',
    )
    expect(keysCell('Open the assistant panel.').textContent).toBe('a')

    // Ctrl and ⌘ are read as Control and Command (3.1.4, 1.1.1).
    for (const [action, glyph, name] of [
      [
        'Open the command menu to go to a page, run an action, or find a project or task.',
        'Ctrl',
        'Control',
      ],
      ['On a Mac, open the command menu.', '⌘', 'Command'],
    ]) {
      const cell = keysCell(action)
      expect(cell.querySelector('[aria-hidden="true"]')?.textContent).toBe(
        glyph,
      )
      expect(cell.querySelector('.sr-only')?.textContent).toBe(name)
    }
    expect(
      screen.getByText(
        'Ctrl is the Control key. ⌘ is the Command key on a Mac.',
      ),
    ).toBeTruthy()
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
