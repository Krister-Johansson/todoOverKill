import { MotionConfig } from 'motion/react'

import { useMotionSetting, useReducedMotion } from '#/hooks/use-reduced-motion'
import { useTheme } from '#/hooks/use-theme'

/**
 * Mounted once in the app shell. Subscribing to the theme and motion stores
 * keeps the dark class and data-motion on html in sync on every route, when
 * the OS setting changes or another tab changes a setting. MotionConfig makes
 * every Motion component follow the in-app override as well as the OS
 * setting (docs/accessibility.md 2.3.3).
 */
export function PreferencesProvider({
  children,
}: {
  children: React.ReactNode
}) {
  useTheme()
  useMotionSetting()
  const reduced = useReducedMotion()

  return (
    <MotionConfig reducedMotion={reduced ? 'always' : 'never'}>
      {children}
    </MotionConfig>
  )
}
