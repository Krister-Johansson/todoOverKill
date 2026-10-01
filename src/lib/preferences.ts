import { z } from 'zod'

/** On or off settings are stored as these strings. */
export const toggleSchema = z.enum(['on', 'off'])
export type Toggle = z.infer<typeof toggleSchema>

/**
 * The on or off settings on the Settings page, with their storage keys and
 * the value used when nothing valid is stored. F14's hotkey hook reads
 * shortcuts; F41 and F42 read the voice settings.
 */
export const PREFERENCES = {
  shortcuts: { key: 'todoOverKill.shortcuts', fallback: 'on' },
  sendOnPause: { key: 'todoOverKill.voice.sendOnPause', fallback: 'off' },
  readAloud: { key: 'todoOverKill.voice.readAloud', fallback: 'off' },
} as const satisfies Record<string, { key: string; fallback: Toggle }>

export type PreferenceName = keyof typeof PREFERENCES

/** The stored value, or the default when it is missing, invalid or unreadable. */
export function readPreference(
  storage: Pick<Storage, 'getItem'>,
  name: PreferenceName,
): Toggle {
  const { key, fallback } = PREFERENCES[name]
  try {
    const parsed = toggleSchema.safeParse(storage.getItem(key))
    return parsed.success ? parsed.data : fallback
  } catch {
    return fallback
  }
}

export function writePreference(
  storage: Pick<Storage, 'setItem'>,
  name: PreferenceName,
  value: Toggle,
) {
  try {
    storage.setItem(PREFERENCES[name].key, value)
  } catch {
    // Storage can be full or blocked; the setting then lasts for this page.
  }
}
