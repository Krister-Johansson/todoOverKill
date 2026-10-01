import { useEffect, useEffectEvent } from 'react'

import { isSingleKeyShortcut } from '#/lib/keyboard'

import { usePreference } from './use-preference'

/**
 * Runs `handlers[event.key]` on a keydown anywhere in the window, while the
 * shortcuts setting is on and isSingleKeyShortcut allows it. The default is
 * prevented, so the key does not also type into the field that the handler
 * may focus, such as the Title field of a dialog it opens.
 */
export function useHotkeys(
  handlers: Partial<Record<string, (event: KeyboardEvent) => void>>,
) {
  const { value } = usePreference('shortcuts')

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const handler = handlers[event.key]
    if (!handler || !isSingleKeyShortcut(event)) return
    event.preventDefault()
    handler(event)
  })

  useEffect(() => {
    if (value !== 'on') return
    const listener = (event: KeyboardEvent) => onKeyDown(event)
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [value])
}
