import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { LiveRegionProvider, useAnnounce } from './live-region'

afterEach(cleanup)

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve))
}

function Announcer({ message }: { message: string }) {
  const announce = useAnnounce()
  return (
    <button type="button" onClick={() => announce(message)}>
      Announce
    </button>
  )
}

function renderRegion(message: string) {
  const { container } = render(
    <LiveRegionProvider>
      <Announcer message={message} />
    </LiveRegionProvider>,
  )
  const region = container.querySelector('[aria-live]')
  if (!(region instanceof HTMLElement)) throw new Error('no live region')
  return region
}

async function clickAnnounce() {
  await act(async () => {
    screen.getByRole('button', { name: 'Announce' }).click()
    await nextFrame()
  })
}

describe('LiveRegionProvider', () => {
  it('renders one polite, atomic, empty region', () => {
    const region = renderRegion('Saved')

    expect(region.getAttribute('aria-live')).toBe('polite')
    expect(region.getAttribute('aria-atomic')).toBe('true')
    expect(region.textContent).toBe('')
  })

  it('puts the announced message in the region', async () => {
    const region = renderRegion('Saved')

    await clickAnnounce()

    expect(region.textContent).toBe('Saved')
  })

  it('clears the region before repeating the same message', async () => {
    const region = renderRegion('Saved')
    await clickAnnounce()

    act(() => {
      screen.getByRole('button', { name: 'Announce' }).click()
    })
    expect(region.textContent).toBe('')

    await act(nextFrame)
    expect(region.textContent).toBe('Saved')
  })

  it('throws when useAnnounce is used outside the provider', () => {
    const error = console.error
    console.error = () => {}
    try {
      expect(() => render(<Announcer message="Saved" />)).toThrow(
        /LiveRegionProvider/,
      )
    } finally {
      console.error = error
    }
  })
})
