import { z } from 'zod'

import { MOTION_STORAGE_KEY } from './motion'

export const themeSettingSchema = z.enum(['system', 'light', 'dark'])
export type ThemeSetting = z.infer<typeof themeSettingSchema>
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'todoOverKill.theme'
export const DARK_QUERY = '(prefers-color-scheme: dark)'

/** The stored setting, or 'system' when it is missing, invalid or unreadable. */
export function readThemeSetting(
  storage: Pick<Storage, 'getItem'>,
): ThemeSetting {
  try {
    const parsed = themeSettingSchema.safeParse(
      storage.getItem(THEME_STORAGE_KEY),
    )
    return parsed.success ? parsed.data : 'system'
  } catch {
    return 'system'
  }
}

export function writeThemeSetting(
  storage: Pick<Storage, 'setItem'>,
  setting: ThemeSetting,
) {
  try {
    storage.setItem(THEME_STORAGE_KEY, setting)
  } catch {
    // Storage can be full or blocked; the setting then lasts for this page.
  }
}

export function resolveTheme(
  setting: ThemeSetting,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (setting === 'system') return systemPrefersDark ? 'dark' : 'light'
  return setting
}

/**
 * Adds or removes the dark class on html. Does nothing when the class
 * already matches, so running it after the inline head script never touches
 * the DOM.
 */
export function applyTheme(root: HTMLElement, resolved: ResolvedTheme) {
  const dark = resolved === 'dark'
  if (root.classList.contains('dark') === dark) return
  if (dark) root.classList.add('dark')
  else root.classList.remove('dark')
}

export const THEME_INIT_SCRIPT_ID = 'theme-init'

/**
 * Runs as a blocking script in head, before the parser reaches body, so the
 * first paint already has the stored theme and motion override. It repeats
 * the rules of readThemeSetting, resolveTheme and applyMotionSetting because
 * it cannot import them; an unknown theme value counts as 'system'.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var d=document.documentElement,t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)}),m=localStorage.getItem(${JSON.stringify(MOTION_STORAGE_KEY)});if(t==='dark'||(t!=='light'&&typeof matchMedia==='function'&&matchMedia(${JSON.stringify(DARK_QUERY)}).matches))d.classList.add('dark');if(m==='reduce'||m==='allow')d.setAttribute('data-motion',m)}catch(e){}})()`
