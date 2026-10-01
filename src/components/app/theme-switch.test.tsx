import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { THEME_STORAGE_KEY } from '#/lib/theme'
import { installMatchMedia } from '#/test/match-media'

import { LiveRegionProvider } from './live-region'
import { ThemeSwitch } from './theme-switch'

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
})

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve))
}

function renderSwitch() {
  const { container } = render(
    <LiveRegionProvider>
      <ThemeSwitch />
    </LiveRegionProvider>,
  )
  const region = container.querySelector('[aria-live]')
  if (!(region instanceof HTMLElement)) throw new Error('no live region')
  return region
}

describe('ThemeSwitch', () => {
  it('is a labelled group of three radios with System checked', () => {
    renderSwitch()

    expect(screen.getByRole('group', { name: 'Theme' })).toBeTruthy()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(
      screen.getByRole<HTMLInputElement>('radio', { name: 'System' }).checked,
    ).toBe(true)
  })

  it('checks the stored setting', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light')
    renderSwitch()

    expect(
      screen.getByRole<HTMLInputElement>('radio', { name: 'Light' }).checked,
    ).toBe(true)
  })

  it('stores, applies and announces the chosen theme', async () => {
    const region = renderSwitch()

    await act(async () => {
      screen.getByRole('radio', { name: 'Dark' }).click()
      await nextFrame()
    })

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(root.classList.contains('dark')).toBe(true)
    expect(region.textContent).toBe('Theme set to Dark')

    await act(async () => {
      screen.getByRole('radio', { name: 'Light' }).click()
      await nextFrame()
    })

    expect(root.classList.contains('dark')).toBe(false)
    expect(region.textContent).toBe('Theme set to Light')
  })
})
