import { useEffect, useSyncExternalStore } from 'react'

import {
  DARK_QUERY,
  THEME_STORAGE_KEY,
  applyTheme,
  readThemeSetting,
  resolveTheme,
  writeThemeSetting,
} from '#/lib/theme'

import type { ThemeSetting } from '#/lib/theme'

/*
 * The theme store. React renders the server snapshot ('system', light) during
 * hydration, before the client snapshot, so the DOM is never written from a
 * rendered value: that commit would remove the class the inline head script
 * set. The store writes the class itself, from live values, whenever they
 * change, and once on mount.
 */

const listeners = new Set<() => void>()

function getSetting() {
  return readThemeSetting(window.localStorage)
}

function getSystemDark() {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia(DARK_QUERY).matches
  )
}

function applyFromStore() {
  applyTheme(
    document.documentElement,
    resolveTheme(getSetting(), getSystemDark()),
  )
}

function notify() {
  applyFromStore()
  for (const listener of listeners) listener()
}

function onStorage(event: StorageEvent) {
  // A null key means another tab cleared storage.
  if (event.key === THEME_STORAGE_KEY || event.key === null) notify()
}

// Kept so the change listener is removed from the list it was added to:
// matchMedia returns a new list on every call.
let darkQuery: MediaQueryList | null = null

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (listeners.size === 1) {
    window.addEventListener('storage', onStorage)
    if (typeof window.matchMedia === 'function') {
      darkQuery = window.matchMedia(DARK_QUERY)
      darkQuery.addEventListener('change', notify)
    }
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      window.removeEventListener('storage', onStorage)
      darkQuery?.removeEventListener('change', notify)
      darkQuery = null
    }
  }
}

function setTheme(setting: ThemeSetting) {
  writeThemeSetting(window.localStorage, setting)
  notify()
}

/**
 * The theme setting, the theme it resolves to, and setTheme. The stored
 * setting persists in localStorage; 'system' follows prefers-color-scheme.
 */
export function useTheme() {
  const setting = useSyncExternalStore<ThemeSetting>(
    subscribe,
    getSetting,
    () => 'system',
  )
  const systemDark = useSyncExternalStore(subscribe, getSystemDark, () => false)

  // Reads the store, not the rendered values, so it does nothing after the
  // head script and cannot undo it during hydration.
  useEffect(applyFromStore, [])

  return { setting, resolved: resolveTheme(setting, systemDark), setTheme }
}
