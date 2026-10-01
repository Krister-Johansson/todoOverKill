import { z } from 'zod'

import type { Transition, Variants } from 'motion/react'

/**
 * The in-app motion override (docs/accessibility.md 2.3.3). 'system' follows
 * prefers-reduced-motion; 'reduce' and 'allow' override it either way.
 */
export const motionSettingSchema = z.enum(['system', 'reduce', 'allow'])
export type MotionSetting = z.infer<typeof motionSettingSchema>

export const MOTION_STORAGE_KEY = 'todoOverKill.motion'

/** The stored setting, or 'system' when it is missing, invalid or unreadable. */
export function readMotionSetting(
  storage: Pick<Storage, 'getItem'>,
): MotionSetting {
  try {
    const parsed = motionSettingSchema.safeParse(
      storage.getItem(MOTION_STORAGE_KEY),
    )
    return parsed.success ? parsed.data : 'system'
  } catch {
    return 'system'
  }
}

export function writeMotionSetting(
  storage: Pick<Storage, 'setItem'>,
  setting: MotionSetting,
) {
  try {
    storage.setItem(MOTION_STORAGE_KEY, setting)
  } catch {
    // Storage can be full or blocked; the setting then lasts for this page.
  }
}

/**
 * Sets data-motion on html to the override, or removes it for 'system', so
 * CSS can collapse transitions. Does nothing when the attribute already
 * matches, so running it after the inline head script never touches the DOM.
 */
export function applyMotionSetting(root: HTMLElement, setting: MotionSetting) {
  const target = setting === 'system' ? null : setting
  if (root.getAttribute('data-motion') === target) return
  if (target === null) root.removeAttribute('data-motion')
  else root.setAttribute('data-motion', target)
}

/** Durations in seconds, as Motion expects. docs/project.md caps them at 0.5. */
export const durations = { fast: 0.15, base: 0.2, slow: 0.25 }

type Bezier = [number, number, number, number]

export const easings: { standard: Bezier; exit: Bezier } = {
  standard: [0.2, 0, 0, 1],
  exit: [0.4, 0, 1, 1],
}

/**
 * Transitions and variants for Motion components. With `reduced` every
 * duration is 0 and nothing scales or moves, so state changes are instant.
 */
export function motionPresets(reduced: boolean) {
  const presetDurations = reduced
    ? { fast: 0, base: 0, slow: 0 }
    : { ...durations }
  const transition: Transition = {
    duration: presetDurations.base,
    ease: easings.standard,
  }
  const exitTransition: Transition = {
    duration: presetDurations.fast,
    ease: easings.exit,
  }
  const fade: Variants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition },
    exit: { opacity: 0, transition: exitTransition },
  }
  const scaleIn: Variants = reduced
    ? fade
    : {
        hidden: { opacity: 0, scale: 0.96 },
        visible: { opacity: 1, scale: 1, transition },
        exit: { opacity: 0, scale: 0.96, transition: exitTransition },
      }
  return { durations: presetDurations, transition, fade, scaleIn }
}

export const fullMotion = motionPresets(false)
export const noMotion = motionPresets(true)
