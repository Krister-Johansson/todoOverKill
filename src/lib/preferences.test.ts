import { afterEach, describe, expect, it } from 'vitest'

import { PREFERENCES, readPreference, writePreference } from './preferences'

afterEach(() => {
  localStorage.clear()
})

describe('readPreference', () => {
  it('defaults shortcuts to on and the voice settings to off', () => {
    expect(readPreference(localStorage, 'shortcuts')).toBe('on')
    expect(readPreference(localStorage, 'sendOnPause')).toBe('off')
    expect(readPreference(localStorage, 'readAloud')).toBe('off')
  })

  it('stores each setting under its own todoOverKill key', () => {
    expect(PREFERENCES.shortcuts.key).toBe('todoOverKill.shortcuts')
    expect(PREFERENCES.sendOnPause.key).toBe('todoOverKill.voice.sendOnPause')
    expect(PREFERENCES.readAloud.key).toBe('todoOverKill.voice.readAloud')
  })

  it('returns the stored value after a write', () => {
    writePreference(localStorage, 'shortcuts', 'off')

    expect(localStorage.getItem('todoOverKill.shortcuts')).toBe('off')
    expect(readPreference(localStorage, 'shortcuts')).toBe('off')

    writePreference(localStorage, 'readAloud', 'on')
    expect(readPreference(localStorage, 'readAloud')).toBe('on')
  })

  it('falls back to the default when the value is invalid', () => {
    localStorage.setItem('todoOverKill.shortcuts', 'false')

    expect(readPreference(localStorage, 'shortcuts')).toBe('on')
  })

  it('falls back to the default when storage throws', () => {
    const storage = {
      getItem: () => {
        throw new Error('blocked')
      },
    }

    expect(readPreference(storage, 'shortcuts')).toBe('on')
    expect(readPreference(storage, 'sendOnPause')).toBe('off')
  })
})

describe('writePreference', () => {
  it('does not throw when storage is full or blocked', () => {
    const storage = {
      setItem: () => {
        throw new Error('quota')
      },
    }

    expect(() => writePreference(storage, 'shortcuts', 'off')).not.toThrow()
  })
})
