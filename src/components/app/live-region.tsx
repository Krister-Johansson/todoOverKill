import { createContext, use, useCallback, useRef, useState } from 'react'

type Announce = (message: string) => void

const LiveRegionContext = createContext<Announce | null>(null)

/**
 * The one polite live region in the app (docs/accessibility.md 4.1.3).
 * Components announce status changes through useAnnounce() instead of adding
 * their own aria-live elements, so screen readers hear one queue.
 */
export function LiveRegionProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [message, setMessage] = useState('')
  const frame = useRef<number | null>(null)

  const announce = useCallback<Announce>((next) => {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    // Clearing first means the same message twice in a row still changes the
    // region's text, so it is announced again.
    setMessage('')
    frame.current = requestAnimationFrame(() => {
      frame.current = null
      setMessage(next)
    })
  }, [])

  return (
    <LiveRegionContext value={announce}>
      {children}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {message}
      </div>
    </LiveRegionContext>
  )
}

/** Returns announce(message), which reads the message in the live region. */
export function useAnnounce() {
  const announce = use(LiveRegionContext)
  if (!announce) {
    throw new Error('useAnnounce must be used inside LiveRegionProvider')
  }
  return announce
}
