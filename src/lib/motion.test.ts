import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  MOTION_STORAGE_KEY,
  applyMotionSetting,
  durations,
  fullMotion,
  motionPresets,
  noMotion,
  readMotionSetting,
} from './motion'

import type { Transition, Variants } from 'motion/react'

const root = document.documentElement

afterEach(() => {
  localStorage.clear()
  root.removeAttribute('data-motion')
  vi.restoreAllMocks()
})

/** Every duration in a set of variants. */
function variantDurations(variants: Variants) {
  return Object.values(variants).map(
    (variant) =>
      ((variant as { transition?: Transition }).transition ?? {}).duration,
  )
}

describe('motionPresets', () => {
  it('uses the documented durations, none over 0.5 s', () => {
    expect(fullMotion.durations).toEqual({ fast: 0.15, base: 0.2, slow: 0.25 })
    expect(fullMotion.transition.duration).toBe(durations.base)
    for (const value of Object.values(fullMotion.durations)) {
      expect(value).toBeLessThanOrEqual(0.5)
    }
  })

  it('scales in from 96% with a fade', () => {
    expect(fullMotion.scaleIn.hidden).toMatchObject({ opacity: 0, scale: 0.96 })
    expect(fullMotion.scaleIn.visible).toMatchObject({ opacity: 1, scale: 1 })
  })

  it('reports zero durations when reduced', () => {
    const reduced = motionPresets(true)

    expect(reduced.durations).toEqual({ fast: 0, base: 0, slow: 0 })
    expect(reduced.transition.duration).toBe(0)
    expect(variantDurations(reduced.fade)).toEqual([undefined, 0, 0])
    expect(variantDurations(reduced.scaleIn)).toEqual([undefined, 0, 0])
  })

  it('drops the transform from scale-in when reduced', () => {
    for (const variant of Object.values(noMotion.scaleIn)) {
      expect(variant).not.toHaveProperty('scale')
    }
  })
})

describe('motion setting storage', () => {
  it('falls back to system for missing or invalid values', () => {
    expect(readMotionSetting(localStorage)).toBe('system')

    localStorage.setItem(MOTION_STORAGE_KEY, 'fast')
    expect(readMotionSetting(localStorage)).toBe('system')

    localStorage.setItem(MOTION_STORAGE_KEY, 'reduce')
    expect(readMotionSetting(localStorage)).toBe('reduce')
  })

  it('sets data-motion for an override and removes it for system', () => {
    applyMotionSetting(root, 'reduce')
    expect(root.getAttribute('data-motion')).toBe('reduce')

    applyMotionSetting(root, 'allow')
    expect(root.getAttribute('data-motion')).toBe('allow')

    applyMotionSetting(root, 'system')
    expect(root.hasAttribute('data-motion')).toBe(false)
  })

  it('leaves the attribute alone when it already matches', () => {
    const set = vi.spyOn(root, 'setAttribute')
    const remove = vi.spyOn(root, 'removeAttribute')

    applyMotionSetting(root, 'system')
    root.setAttribute('data-motion', 'reduce')
    set.mockClear()
    applyMotionSetting(root, 'reduce')

    expect(set).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
  })
})
