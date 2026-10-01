import { act, cleanup, renderHook } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'

import { usePreference } from './use-preference'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('usePreference', () => {
  it('returns the default when nothing is stored', () => {
    const { result } = renderHook(() => usePreference('shortcuts'))

    expect(result.current.value).toBe('on')
  })

  it('returns the stored value', () => {
    localStorage.setItem('todoOverKill.shortcuts', 'off')

    const { result } = renderHook(() => usePreference('shortcuts'))

    expect(result.current.value).toBe('off')
  })

  it('persists a change and re-renders every reader', () => {
    const first = renderHook(() => usePreference('shortcuts'))
    const second = renderHook(() => usePreference('shortcuts'))

    act(() => first.result.current.setValue('off'))

    expect(localStorage.getItem('todoOverKill.shortcuts')).toBe('off')
    expect(first.result.current.value).toBe('off')
    expect(second.result.current.value).toBe('off')
  })

  it('picks up a change made in another tab', () => {
    const { result } = renderHook(() => usePreference('readAloud'))

    act(() => {
      localStorage.setItem('todoOverKill.voice.readAloud', 'on')
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'todoOverKill.voice.readAloud',
          newValue: 'on',
        }),
      )
    })

    expect(result.current.value).toBe('on')

    act(() => {
      localStorage.clear()
      window.dispatchEvent(new StorageEvent('storage', { key: null }))
    })

    expect(result.current.value).toBe('off')
  })

  it('renders the default on the server', () => {
    localStorage.setItem('todoOverKill.shortcuts', 'off')

    function Probe() {
      return <p>{usePreference('shortcuts').value}</p>
    }

    expect(renderToString(<Probe />)).toContain('on')
  })
})
