import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Markdown } from './markdown'

// jsdom has no ResizeObserver. Nothing overflows there, so a stub that never
// calls back is enough.
beforeEach(() => {
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
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function renderMarkdown(source: string, headingLevel: 1 | 2 = 2) {
  return render(<Markdown headingLevel={headingLevel}>{source}</Markdown>)
    .container
}

describe('Markdown', () => {
  it('renders paragraphs, emphasis, tables and strikethrough', () => {
    const container = renderMarkdown(
      [
        'Some **bold** text.',
        '',
        '| A | B |',
        '| - | - |',
        '| 1 | 2 |',
        '',
        '~~gone~~',
      ].join('\n'),
    )
    expect(screen.getByText('bold').tagName).toBe('STRONG')
    expect(screen.getByRole('table')).toBeTruthy()
    expect(screen.getByRole('cell', { name: '2' })).toBeTruthy()
    expect(container.querySelector('del')?.textContent).toBe('gone')
  })

  it('shows raw HTML as text', () => {
    const container = renderMarkdown(
      'A <b>bold</b> word.\n\n<script>alert(1)</script>',
    )
    expect(container.querySelector('b')).toBeNull()
    expect(container.querySelector('script')).toBeNull()
    expect(container.textContent).toContain('<b>')
    expect(container.textContent).toContain('<script>alert(1)</script>')
  })

  it('drops a javascript: link but keeps its text', () => {
    const container = renderMarkdown('[x](javascript:alert(1))')
    expect(container.querySelector('a')).toBeNull()
    expect(screen.getByText('x')).toBeTruthy()
  })

  it('renders a safe link', () => {
    renderMarkdown('[ok](https://example.com)')
    expect(screen.getByRole('link', { name: 'ok' }).getAttribute('href')).toBe(
      'https://example.com',
    )
  })

  it('demotes headings below the section heading', () => {
    renderMarkdown('# Top\n\n###### Bottom', 2)
    expect(screen.getByRole('heading', { name: 'Top', level: 3 })).toBeTruthy()
    expect(
      screen.getByRole('heading', { name: 'Bottom', level: 6 }),
    ).toBeTruthy()
  })

  it('shows task list state as text, not as checkboxes', () => {
    const container = renderMarkdown('- [x] Done thing\n- [ ] Open thing')
    expect(container.querySelector('input')).toBeNull()
    expect(screen.getByText('done')).toBeTruthy()
    expect(screen.getByText('not done')).toBeTruthy()
  })

  it('keeps the visually hidden footnotes heading right below the section', () => {
    renderMarkdown('A note.[^1]\n\n[^1]: The note.', 2)
    const heading = screen.getByRole('heading', { name: 'Footnotes' })
    expect(heading.tagName).toBe('H3')
    expect(heading.classList.contains('sr-only')).toBe(true)
  })

  it('adds no region or Tab stop for a code block that fits', () => {
    const container = renderMarkdown('```\nconst a = 1\n```')
    expect(screen.queryByRole('region')).toBeNull()
    expect(container.querySelector('[tabindex]')).toBeNull()
    expect(container.querySelector('pre')?.textContent).toContain('const a = 1')
  })

  it('makes an overflowing code block a region named Code block', () => {
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(500)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(100)
    renderMarkdown('```\nconst a = 1\n```')
    const region = screen.getByRole('region', { name: 'Code block' })
    expect(region.getAttribute('tabindex')).toBe('0')
    expect(region.querySelector('pre')?.textContent).toContain('const a = 1')
  })
})
