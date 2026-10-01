import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { MOTION_STORAGE_KEY } from '#/lib/motion'
import { installMatchMedia } from '#/test/match-media'

import { LiveRegionProvider } from './live-region'
import { PreferencesProvider } from './preferences'

const root = document.documentElement
let media: ReturnType<typeof installMatchMedia>

beforeEach(() => {
  media = installMatchMedia()
})

afterEach(() => {
  cleanup()
  media.uninstall()
  localStorage.clear()
  root.classList.remove('dark')
  root.removeAttribute('data-motion')
})

function renderProvider() {
  return render(
    <LiveRegionProvider>
      <PreferencesProvider>
        <p>Page</p>
      </PreferencesProvider>
    </LiveRegionProvider>,
  )
}

describe('PreferencesProvider', () => {
  it('renders its children', () => {
    const { getByText } = renderProvider()

    expect(getByText('Page')).toBeTruthy()
  })

  it('follows the OS colour scheme without a Settings control', () => {
    renderProvider()
    expect(root.classList.contains('dark')).toBe(false)

    act(() => media.set({ dark: true }))
    expect(root.classList.contains('dark')).toBe(true)

    act(() => media.set({ dark: false }))
    expect(root.classList.contains('dark')).toBe(false)
  })

  it('applies a motion override set in another tab', () => {
    renderProvider()

    act(() => {
      localStorage.setItem(MOTION_STORAGE_KEY, 'reduce')
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: MOTION_STORAGE_KEY,
          newValue: 'reduce',
        }),
      )
    })

    expect(root.getAttribute('data-motion')).toBe('reduce')
  })
})
