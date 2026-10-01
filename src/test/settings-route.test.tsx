import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { LiveRegionProvider } from '#/components/app/live-region'
import { Route } from '#/routes/_app/settings'
import { installMatchMedia } from '#/test/match-media'

let media: ReturnType<typeof installMatchMedia>

beforeEach(() => {
  media = installMatchMedia()
})

afterEach(() => {
  cleanup()
  media.uninstall()
  localStorage.clear()
})

function renderPage() {
  const Component = Route.options.component!
  render(
    <LiveRegionProvider>
      <Component />
    </LiveRegionProvider>,
  )
}

describe('settings route', () => {
  it('has Appearance, Keyboard and Voice sections', () => {
    renderPage()

    expect(
      screen.getByRole('heading', { level: 1, name: 'Settings' }),
    ).toBeTruthy()
    expect(
      screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent),
    ).toEqual(['Appearance', 'Keyboard', 'Voice'])
    for (const name of ['Appearance', 'Keyboard', 'Voice']) {
      expect(screen.getByRole('region', { name })).toBeTruthy()
    }
  })

  it('labels every radio and switch with visible text', () => {
    renderPage()

    expect(screen.getByRole('group', { name: 'Theme' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Motion' })).toBeTruthy()
    const controls = [
      ...screen.getAllByRole('radio'),
      ...screen.getAllByRole('switch'),
    ]
    expect(controls).toHaveLength(9)
    for (const control of controls) {
      const labels = (control as HTMLInputElement | HTMLButtonElement).labels
      expect(labels?.length).toBe(1)
      expect(labels?.[0].textContent.trim()).toBeTruthy()
    }
  })

  it('turns shortcuts on and disables the voice switches', () => {
    renderPage()

    expect(
      screen
        .getByRole('switch', { name: 'Single-key shortcuts' })
        .getAttribute('aria-checked'),
    ).toBe('true')
    for (const name of ['Send when I stop speaking', 'Read replies aloud']) {
      const control = screen.getByRole<HTMLButtonElement>('switch', { name })
      expect(control.disabled).toBe(true)
      expect(control.getAttribute('aria-checked')).toBe('false')
    }
    expect(
      screen.getAllByText(
        'Not available yet. Voice arrives in a later release.',
      ),
    ).toHaveLength(2)
  })

  it('names itself Settings for the breadcrumb', () => {
    expect(Route.options.staticData?.title).toBe('Settings')
  })
})
