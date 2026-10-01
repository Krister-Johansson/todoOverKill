import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useHotkeys } from './use-hotkeys'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

function Harness({
  onC,
  children,
}: {
  onC: () => void
  children?: React.ReactNode
}) {
  useHotkeys({ c: onC })
  return <>{children}</>
}

function press(target: Element, init: KeyboardEventInit = {}) {
  // fireEvent returns false when the default was prevented.
  return !fireEvent.keyDown(target, { key: 'c', ...init })
}

describe('useHotkeys', () => {
  it('runs the handler on c and prevents the default', () => {
    const onC = vi.fn()
    const { getByRole } = render(
      <Harness onC={onC}>
        <button>Go</button>
      </Harness>,
    )

    expect(press(getByRole('button'))).toBe(true)
    expect(onC).toHaveBeenCalledOnce()
  })

  it('runs the handler on C, as with Caps Lock on', () => {
    const onC = vi.fn()
    render(<Harness onC={onC} />)

    expect(press(document.body, { key: 'C' })).toBe(true)
    expect(onC).toHaveBeenCalledOnce()
  })

  it('ignores other keys', () => {
    const onC = vi.fn()
    render(<Harness onC={onC} />)

    expect(press(document.body, { key: 'x' })).toBe(false)
    expect(onC).not.toHaveBeenCalled()
  })

  it.each([
    ['an input', <input aria-label="Field" key="input" />],
    [
      'a select',
      <select aria-label="Field" key="select">
        <option>One</option>
      </select>,
    ],
  ])('does nothing in %s', (_, field) => {
    const onC = vi.fn()
    const { getByLabelText } = render(<Harness onC={onC}>{field}</Harness>)

    expect(press(getByLabelText('Field'))).toBe(false)
    expect(onC).not.toHaveBeenCalled()
  })

  it('does nothing when shortcuts are off', () => {
    localStorage.setItem('todoOverKill.shortcuts', 'off')
    const onC = vi.fn()
    render(<Harness onC={onC} />)

    expect(press(document.body)).toBe(false)
    expect(onC).not.toHaveBeenCalled()
  })

  it('does nothing with a modifier held', () => {
    const onC = vi.fn()
    render(<Harness onC={onC} />)

    press(document.body, { ctrlKey: true })
    press(document.body, { metaKey: true })
    press(document.body, { altKey: true })
    expect(onC).not.toHaveBeenCalled()
  })

  it('does nothing while a dialog is open', () => {
    const onC = vi.fn()
    render(
      <Harness onC={onC}>
        <div role="dialog" aria-label="New project" />
      </Harness>,
    )

    expect(press(document.body)).toBe(false)
    expect(onC).not.toHaveBeenCalled()
  })
})
