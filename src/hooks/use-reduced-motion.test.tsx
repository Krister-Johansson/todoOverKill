import { act, cleanup, renderHook } from '@testing-library/react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MOTION_STORAGE_KEY } from '#/lib/motion'
import { installMatchMedia } from '#/test/match-media'

import {
  useMotionPresets,
  useMotionSetting,
  useReducedMotion,
} from './use-reduced-motion'

const root = document.documentElement
let media: ReturnType<typeof installMatchMedia> | undefined

afterEach(() => {
  cleanup()
  media?.uninstall()
  localStorage.clear()
  root.removeAttribute('data-motion')
  vi.restoreAllMocks()
})

function useMotion() {
  return {
    ...useMotionSetting(),
    reduced: useReducedMotion(),
    presets: useMotionPresets(),
  }
}

describe('useReducedMotion', () => {
  it('follows the OS when the setting is system', () => {
    media = installMatchMedia({ reducedMotion: true })

    const { result } = renderHook(useMotion)

    expect(result.current.setting).toBe('system')
    expect(result.current.reduced).toBe(true)
    expect(root.hasAttribute('data-motion')).toBe(false)
  })

  it('lets allow override an OS that reduces motion', () => {
    media = installMatchMedia({ reducedMotion: true })
    const { result } = renderHook(useMotion)

    act(() => result.current.setMotionSetting('allow'))

    expect(result.current.reduced).toBe(false)
    expect(root.getAttribute('data-motion')).toBe('allow')
    expect(localStorage.getItem(MOTION_STORAGE_KEY)).toBe('allow')
  })

  it('reports zero durations when the override is reduce', () => {
    media = installMatchMedia({ reducedMotion: false })
    const { result } = renderHook(useMotion)
    expect(result.current.presets.durations.base).toBeGreaterThan(0)

    act(() => result.current.setMotionSetting('reduce'))

    expect(result.current.reduced).toBe(true)
    expect(root.getAttribute('data-motion')).toBe('reduce')
    expect(result.current.presets.durations).toEqual({
      fast: 0,
      base: 0,
      slow: 0,
    })
    expect(result.current.presets.transition.duration).toBe(0)
  })

  it('re-renders when the OS setting changes', () => {
    media = installMatchMedia({ reducedMotion: false })
    const { result } = renderHook(useMotion)
    expect(result.current.reduced).toBe(false)

    act(() => media?.set({ reducedMotion: true }))

    expect(result.current.reduced).toBe(true)
  })

  it('picks up a change made in another tab', () => {
    media = installMatchMedia()
    const { result } = renderHook(useMotion)

    act(() => {
      localStorage.setItem(MOTION_STORAGE_KEY, 'reduce')
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: MOTION_STORAGE_KEY,
          newValue: 'reduce',
        }),
      )
    })

    expect(result.current.setting).toBe('reduce')
    expect(root.getAttribute('data-motion')).toBe('reduce')
  })

  it('keeps the attribute the head script set while hydrating', async () => {
    media = installMatchMedia()
    localStorage.setItem(MOTION_STORAGE_KEY, 'reduce')

    function Probe() {
      return <p>{useMotionSetting().setting}</p>
    }

    // The server has no localStorage, so it renders system.
    const html = renderToString(<Probe />)
    expect(html).toContain('system')

    // What the inline head script does before the body is parsed.
    root.setAttribute('data-motion', 'reduce')
    const remove = vi.spyOn(root, 'removeAttribute')
    const container = document.createElement('div')
    container.innerHTML = html
    document.body.append(container)

    let reactRoot: ReturnType<typeof hydrateRoot> | undefined
    await act(async () => {
      reactRoot = hydrateRoot(container, <Probe />)
    })

    expect(remove).not.toHaveBeenCalledWith('data-motion')
    expect(root.getAttribute('data-motion')).toBe('reduce')
    expect(container.textContent).toBe('reduce')

    act(() => reactRoot?.unmount())
    container.remove()
  })
})
