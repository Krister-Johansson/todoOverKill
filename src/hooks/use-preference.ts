import { useCallback, useSyncExternalStore } from 'react'

import { PREFERENCES, readPreference, writePreference } from '#/lib/preferences'

import type { PreferenceName, Toggle } from '#/lib/preferences'

/*
 * One store for every on or off setting. The server has no localStorage, so
 * the server snapshot is the default; after hydration React renders the
 * stored value, which can differ from the default.
 */

const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

const keys = new Set<string>(Object.values(PREFERENCES).map(({ key }) => key))

function onStorage(event: StorageEvent) {
  // A null key means another tab cleared storage.
  if (event.key === null || keys.has(event.key)) notify()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (listeners.size === 1) window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) window.removeEventListener('storage', onStorage)
  }
}

/**
 * The stored value of one on or off setting and setValue, which persists it
 * in localStorage and updates every component that reads it.
 */
export function usePreference(name: PreferenceName) {
  const value = useSyncExternalStore<Toggle>(
    subscribe,
    () => readPreference(window.localStorage, name),
    () => PREFERENCES[name].fallback,
  )

  const setValue = useCallback(
    (next: Toggle) => {
      writePreference(window.localStorage, name, next)
      notify()
    },
    [name],
  )

  return { value, setValue }
}
