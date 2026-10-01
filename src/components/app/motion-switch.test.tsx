import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { MOTION_STORAGE_KEY } from '#/lib/motion'
import { installMatchMedia } from '#/test/match-media'

import { LiveRegionProvider } from './live-region'
import { MotionSwitch } from './motion-switch'

const root = document.documentElement
let media: ReturnType<typeof installMatchMedia>

beforeEach(() => {
  media = installMatchMedia()
})

afterEach(() => {
  cleanup()
  media.uninstall()
  localStorage.clear()
  root.removeAttribute('data-motion')
})

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve))
}

function renderSwitch() {
  const { container } = render(
    <LiveRegionProvider>
      <MotionSwitch />
    </LiveRegionProvider>,
  )
  const region = container.querySelector('[aria-live]')
  if (!(region instanceof HTMLElement)) throw new Error('no live region')
  return region
}

describe('MotionSwitch', () => {
  it('is a described group of three radios with Follow system checked', () => {
    renderSwitch()

    const group = screen.getByRole('group', { name: 'Motion' })
    expect(group.getAttribute('aria-describedby')).toBeTruthy()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(
      screen.getByRole<HTMLInputElement>('radio', { name: 'Follow system' })
        .checked,
    ).toBe(true)
  })

  it('stores, applies and announces the override', async () => {
    const region = renderSwitch()

    await act(async () => {
      screen.getByRole('radio', { name: 'Reduce' }).click()
      await nextFrame()
    })

    expect(localStorage.getItem(MOTION_STORAGE_KEY)).toBe('reduce')
    expect(root.getAttribute('data-motion')).toBe('reduce')
    expect(region.textContent).toBe('Motion set to Reduce')

    await act(async () => {
      screen.getByRole('radio', { name: 'Follow system' }).click()
      await nextFrame()
    })

    expect(root.hasAttribute('data-motion')).toBe(false)
    expect(region.textContent).toBe('Motion set to Follow system')
  })
})
