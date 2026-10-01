import { useEffect, useSyncExternalStore } from 'react'

import {
  MOTION_STORAGE_KEY,
  applyMotionSetting,
  motionPresets,
  readMotionSetting,
  writeMotionSetting,
} from '#/lib/motion'

import type { MotionSetting } from '#/lib/motion'

/*
 * The motion store. As in use-theme.ts, data-motion is written from live
 * values when they change and once on mount, never from a rendered value,
 * because hydration renders the server snapshot first.
 */

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

const listeners = new Set<() => void>()

function getSetting() {
  return readMotionSetting(window.localStorage)
}

function getSystemReduced() {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia(REDUCED_MOTION_QUERY).matches
  )
}

function applyFromStore() {
  applyMotionSetting(document.documentElement, getSetting())
}

function notify() {
  applyFromStore()
  for (const listener of listeners) listener()
}

function onStorage(event: StorageEvent) {
  // A null key means another tab cleared storage.
  if (event.key === MOTION_STORAGE_KEY || event.key === null) notify()
}

// Kept so the change listener is removed from the list it was added to:
// matchMedia returns a new list on every call.
let reducedQuery: MediaQueryList | null = null

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (listeners.size === 1) {
    window.addEventListener('storage', onStorage)
    if (typeof window.matchMedia === 'function') {
      reducedQuery = window.matchMedia(REDUCED_MOTION_QUERY)
      reducedQuery.addEventListener('change', notify)
    }
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      window.removeEventListener('storage', onStorage)
      reducedQuery?.removeEventListener('change', notify)
      reducedQuery = null
    }
  }
}

function setMotionSetting(setting: MotionSetting) {
  writeMotionSetting(window.localStorage, setting)
  notify()
}

/** The in-app motion override and its setter, persisted in localStorage. */
export function useMotionSetting() {
  const setting = useSyncExternalStore<MotionSetting>(
    subscribe,
    getSetting,
    () => 'system',
  )

  // Reads the store, not the rendered value, so it does nothing after the
  // head script and cannot undo it during hydration.
  useEffect(applyFromStore, [])

  return { setting, setMotionSetting }
}

/**
 * True when motion should be reduced: the in-app override when set, else
 * prefers-reduced-motion.
 */
export function useReducedMotion() {
  const setting = useSyncExternalStore<MotionSetting>(
    subscribe,
    getSetting,
    () => 'system',
  )
  const systemReduced = useSyncExternalStore(
    subscribe,
    getSystemReduced,
    () => false,
  )
  if (setting === 'system') return systemReduced
  return setting === 'reduce'
}

/** The motion presets from src/lib/motion.ts for the current preference. */
export function useMotionPresets() {
  return motionPresets(useReducedMotion())
}
