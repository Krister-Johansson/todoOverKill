import { loadEnv } from 'vite'

/**
 * Remembers which process.env keys came from .env. Vite re-evaluates
 * vite.config.ts when it restarts the dev server after a .env edit, but
 * process.env lives on, so the set is kept on globalThis between loads.
 */
export type DotEnvState = { __todoOverKillEnvKeys?: Set<string> }

/**
 * Loads .env files for `mode` from `root` into process.env. Variables set in
 * the shell win over .env. Keys loaded by an earlier call are dropped first, so
 * a key removed from .env does not linger with its old value.
 *
 * Returns a function that puts process.env and the key set back the way they
 * were before this call.
 */
export function loadDotEnv(
  mode: string,
  root: string,
  state: DotEnvState = globalThis as DotEnvState,
): () => void {
  const snapshot = { ...process.env }
  const previous = state.__todoOverKillEnvKeys ?? new Set<string>()
  for (const key of previous) delete process.env[key]

  // Read the shell keys after the delete, so keys from the previous load are
  // not mistaken for shell variables. loadEnv with an empty prefix also returns
  // every process.env key, with the shell value, so those are filtered out.
  const shellKeys = new Set(Object.keys(process.env))
  const loaded = loadEnv(mode, root, '')
  const fromFile = Object.keys(loaded).filter((key) => !shellKeys.has(key))
  for (const key of fromFile) process.env[key] = loaded[key]
  state.__todoOverKillEnvKeys = new Set(fromFile)

  return () => {
    for (const key of Object.keys(process.env)) {
      if (!(key in snapshot)) delete process.env[key]
    }
    Object.assign(process.env, snapshot)
    state.__todoOverKillEnvKeys = previous
  }
}
