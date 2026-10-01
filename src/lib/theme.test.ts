import { afterEach, describe, expect, it, vi } from 'vitest'

import { installMatchMedia } from '#/test/match-media'

import { MOTION_STORAGE_KEY } from './motion'
import {
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
  applyTheme,
  readThemeSetting,
  resolveTheme,
  writeThemeSetting,
} from './theme'

const root = document.documentElement

afterEach(() => {
  localStorage.clear()
  root.classList.remove('dark')
  root.removeAttribute('data-motion')
  vi.restoreAllMocks()
})

describe('readThemeSetting', () => {
  it('returns the stored setting', () => {
    writeThemeSetting(localStorage, 'dark')

    expect(readThemeSetting(localStorage)).toBe('dark')
  })

  it('falls back to system when the value is missing or invalid', () => {
    expect(readThemeSetting(localStorage)).toBe('system')

    localStorage.setItem(THEME_STORAGE_KEY, 'purple')
    expect(readThemeSetting(localStorage)).toBe('system')
  })

  it('falls back to system when storage throws', () => {
    const storage = {
      getItem: () => {
        throw new Error('blocked')
      },
    }

    expect(readThemeSetting(storage)).toBe('system')
  })
})

describe('resolveTheme', () => {
  it('follows the OS for system and ignores it otherwise', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })
})

describe('applyTheme', () => {
  it('adds and removes the dark class', () => {
    applyTheme(root, 'dark')
    expect(root.classList.contains('dark')).toBe(true)

    applyTheme(root, 'light')
    expect(root.classList.contains('dark')).toBe(false)
  })

  it('leaves the class list alone when it already matches', () => {
    const add = vi.spyOn(root.classList, 'add')
    const remove = vi.spyOn(root.classList, 'remove')

    applyTheme(root, 'light')
    expect(remove).not.toHaveBeenCalled()

    root.setAttribute('class', 'dark')
    applyTheme(root, 'dark')
    expect(add).not.toHaveBeenCalled()
  })
})

describe('THEME_INIT_SCRIPT', () => {
  const run = new Function(THEME_INIT_SCRIPT) as () => void

  const cases: Array<{
    theme: string | null
    motion: string | null
    osDark: boolean
    dark: boolean
    dataMotion: string | null
  }> = [
    { theme: null, motion: null, osDark: false, dark: false, dataMotion: null },
    { theme: null, motion: null, osDark: true, dark: true, dataMotion: null },
    {
      theme: 'system',
      motion: 'system',
      osDark: true,
      dark: true,
      dataMotion: null,
    },
    {
      theme: 'light',
      motion: 'reduce',
      osDark: true,
      dark: false,
      dataMotion: 'reduce',
    },
    {
      theme: 'dark',
      motion: 'allow',
      osDark: false,
      dark: true,
      dataMotion: 'allow',
    },
    {
      theme: 'purple',
      motion: 'fast',
      osDark: false,
      dark: false,
      dataMotion: null,
    },
  ]

  for (const { theme, motion, osDark, dark, dataMotion } of cases) {
    it(`theme ${theme}, motion ${motion}, OS dark ${osDark}`, () => {
      const media = installMatchMedia({ dark: osDark })
      if (theme !== null) localStorage.setItem(THEME_STORAGE_KEY, theme)
      if (motion !== null) localStorage.setItem(MOTION_STORAGE_KEY, motion)

      try {
        run()
      } finally {
        media.uninstall()
      }

      expect(root.classList.contains('dark')).toBe(dark)
      expect(root.getAttribute('data-motion')).toBe(dataMotion)
    })
  }

  it('does not throw without matchMedia or storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    expect(run).not.toThrow()
    expect(root.classList.contains('dark')).toBe(false)
  })

  it('is ASCII only', () => {
    expect(THEME_INIT_SCRIPT).toMatch(/^[\x20-\x7e]*$/)
  })
})
