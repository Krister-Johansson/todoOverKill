import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { LiveRegionProvider } from './live-region'
import { PreferenceSwitch } from './preference-switch'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve))
}

function renderWithRegion(children: React.ReactNode) {
  const { container } = render(
    <LiveRegionProvider>{children}</LiveRegionProvider>,
  )
  const region = container.querySelector('[aria-live]')
  if (!(region instanceof HTMLElement)) throw new Error('no live region')
  return region
}

function describedBy(element: HTMLElement) {
  return (element.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .map((id) => document.getElementById(id)?.textContent)
}

describe('PreferenceSwitch', () => {
  it('is a switch named by its visible label and described by its text', () => {
    renderWithRegion(
      <PreferenceSwitch
        name="shortcuts"
        label="Single-key shortcuts"
        description="Shortcuts work outside text fields."
      />,
    )

    const control = screen.getByRole('switch', {
      name: 'Single-key shortcuts',
    })
    expect(control.getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText('Single-key shortcuts').tagName).toBe('LABEL')
    expect(describedBy(control)).toEqual([
      'Shortcuts work outside text fields.',
    ])
  })

  it('stores and announces the change', async () => {
    const region = renderWithRegion(
      <PreferenceSwitch
        name="shortcuts"
        label="Single-key shortcuts"
        description="Shortcuts work outside text fields."
      />,
    )
    const control = screen.getByRole('switch', {
      name: 'Single-key shortcuts',
    })

    await act(async () => {
      control.click()
      await nextFrame()
    })

    expect(control.getAttribute('aria-checked')).toBe('false')
    expect(localStorage.getItem('todoOverKill.shortcuts')).toBe('off')
    expect(region.textContent).toBe('Single-key shortcuts turned off')

    await act(async () => {
      control.click()
      await nextFrame()
    })

    expect(localStorage.getItem('todoOverKill.shortcuts')).toBe('on')
    expect(region.textContent).toBe('Single-key shortcuts turned on')
  })

  it('keeps a disabled placeholder at its default and reads its note', async () => {
    const region = renderWithRegion(
      <PreferenceSwitch
        name="readAloud"
        label="Read replies aloud"
        description="The assistant speaks its replies."
        disabled
        note="Not available yet."
      />,
    )
    const control = screen.getByRole<HTMLButtonElement>('switch', {
      name: 'Read replies aloud',
    })

    await act(async () => {
      control.click()
      await nextFrame()
    })

    expect(control.disabled).toBe(true)
    expect(control.getAttribute('aria-checked')).toBe('false')
    expect(localStorage.getItem('todoOverKill.voice.readAloud')).toBeNull()
    expect(region.textContent).toBe('')
    expect(describedBy(control)).toEqual([
      'The assistant speaks its replies.',
      'Not available yet.',
    ])
    expect(screen.getByText('Not available yet.').className).toContain(
      'text-muted-foreground',
    )
  })
})
