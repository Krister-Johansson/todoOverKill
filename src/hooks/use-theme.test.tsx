import { act, cleanup, renderHook } from '@testing-library/react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { THEME_STORAGE_KEY } from '#/lib/theme'
import { installMatchMedia } from '#/test/match-media'

import { useTheme } from './use-theme'

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
  vi.restoreAllMocks()
})

function storageEvent(newValue: string | null) {
  localStorage.setItem(THEME_STORAGE_KEY, newValue ?? '')
  window.dispatchEvent(
    new StorageEvent('storage', { key: THEME_STORAGE_KEY, newValue }),
  )
}

describe('useTheme', () => {
  it('defaults to system and resolves it from the OS', () => {
    const { result } = renderHook(useTheme)

    expect(result.current.setting).toBe('system')
    expect(result.current.resolved).toBe('light')
    expect(root.classList.contains('dark')).toBe(false)
  })

  it('persists and applies the chosen theme', () => {
    const { result } = renderHook(useTheme)

    act(() => result.current.setTheme('dark'))

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(result.current.setting).toBe('dark')
    expect(result.current.resolved).toBe('dark')
    expect(root.classList.contains('dark')).toBe(true)

    act(() => result.current.setTheme('light'))

    expect(root.classList.contains('dark')).toBe(false)
  })

  it('follows an OS change while the setting is system', () => {
    const { result } = renderHook(useTheme)

    act(() => media.set({ dark: true }))

    expect(result.current.resolved).toBe('dark')
    expect(root.classList.contains('dark')).toBe(true)

    act(() => media.set({ dark: false }))

    expect(result.current.resolved).toBe('light')
    expect(root.classList.contains('dark')).toBe(false)
  })

  it('ignores an OS change when the setting is explicit', () => {
    const { result } = renderHook(useTheme)
    act(() => result.current.setTheme('light'))

    act(() => media.set({ dark: true }))

    expect(result.current.resolved).toBe('light')
    expect(root.classList.contains('dark')).toBe(false)
  })

  it('picks up a change made in another tab', () => {
    const { result } = renderHook(useTheme)

    act(() => storageEvent('dark'))

    expect(result.current.setting).toBe('dark')
    expect(root.classList.contains('dark')).toBe(true)
  })

  it('keeps the class the head script set while hydrating', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark')

    function Probe() {
      return <p>{useTheme().resolved}</p>
    }

    // The server has no localStorage, so it renders light.
    const html = renderToString(<Probe />)
    expect(html).toContain('light')

    // What the inline head script does before the body is parsed.
    root.classList.add('dark')
    const remove = vi.spyOn(root.classList, 'remove')
    const container = document.createElement('div')
    container.innerHTML = html
    document.body.append(container)

    let reactRoot: ReturnType<typeof hydrateRoot> | undefined
    await act(async () => {
      reactRoot = hydrateRoot(container, <Probe />)
    })

    expect(remove).not.toHaveBeenCalledWith('dark')
    expect(root.classList.contains('dark')).toBe(true)
    expect(container.textContent).toBe('dark')

    act(() => reactRoot?.unmount())
    container.remove()
  })
})
