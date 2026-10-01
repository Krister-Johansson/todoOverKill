const DARK_QUERY = '(prefers-color-scheme: dark)'
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

interface MediaState {
  dark?: boolean
  reducedMotion?: boolean
}

type Listener = (event: MediaQueryListEvent) => void

/**
 * Replaces window.matchMedia, which jsdom does not implement, with a stub
 * that answers the colour-scheme and reduced-motion queries. set() changes
 * the answers and fires `change` on every list whose result changed, as a
 * browser does when the OS setting flips. Any other query never matches.
 */
export function installMatchMedia(initial: MediaState = {}) {
  const state = {
    [DARK_QUERY]: initial.dark ?? false,
    [REDUCED_MOTION_QUERY]: initial.reducedMotion ?? false,
  }
  const listeners = new Map<string, Set<Listener>>()
  const original = Object.getOwnPropertyDescriptor(window, 'matchMedia')

  function matches(query: string) {
    return query in state ? state[query as keyof typeof state] : false
  }

  function matchMedia(query: string): MediaQueryList {
    const own = listeners.get(query) ?? new Set<Listener>()
    listeners.set(query, own)
    const list = {
      get matches() {
        return matches(query)
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: Listener) => {
        own.add(listener)
      },
      removeEventListener: (_type: string, listener: Listener) => {
        own.delete(listener)
      },
      addListener: (listener: Listener) => own.add(listener),
      removeListener: (listener: Listener) => own.delete(listener),
      dispatchEvent: () => true,
    }
    return list as unknown as MediaQueryList
  }

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: matchMedia,
  })

  function fire(query: string) {
    const event = { matches: matches(query), media: query }
    for (const listener of listeners.get(query) ?? []) {
      listener(event as MediaQueryListEvent)
    }
  }

  return {
    set(next: MediaState) {
      if (next.dark !== undefined && next.dark !== state[DARK_QUERY]) {
        state[DARK_QUERY] = next.dark
        fire(DARK_QUERY)
      }
      if (
        next.reducedMotion !== undefined &&
        next.reducedMotion !== state[REDUCED_MOTION_QUERY]
      ) {
        state[REDUCED_MOTION_QUERY] = next.reducedMotion
        fire(REDUCED_MOTION_QUERY)
      }
    },
    uninstall() {
      if (original) Object.defineProperty(window, 'matchMedia', original)
      else Reflect.deleteProperty(window, 'matchMedia')
    },
  }
}
