// @vitest-environment node
// The loader reads files from disk and only ever runs in Node, from
// vite.config.ts.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { loadDotEnv } from '#/lib/load-dot-env'
import type { DotEnvState } from '#/lib/load-dot-env'

describe('loadDotEnv', () => {
  let root: string
  let state: DotEnvState

  function writeDotEnv(contents: string) {
    writeFileSync(join(root, '.env'), contents)
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'load-dot-env-'))
    state = {}
    // stubEnv records the original values, so unstubAllEnvs also removes the
    // keys the loader writes.
    vi.stubEnv('TODO_A', undefined)
    vi.stubEnv('TODO_B', undefined)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    rmSync(root, { recursive: true, force: true })
  })

  it('copies .env values into process.env and records their keys', () => {
    writeDotEnv('TODO_A=from-file\nTODO_B=also-from-file\n')

    loadDotEnv('development', root, state)

    expect(process.env.TODO_A).toBe('from-file')
    expect(process.env.TODO_B).toBe('also-from-file')
    expect(state.__todoOverKillEnvKeys).toEqual(new Set(['TODO_A', 'TODO_B']))
  })

  it('keeps a value set in the shell over the one in .env', () => {
    vi.stubEnv('TODO_A', 'from-shell')
    writeDotEnv('TODO_A=from-file\nTODO_B=from-file\n')

    loadDotEnv('development', root, state)

    expect(process.env.TODO_A).toBe('from-shell')
    expect(process.env.TODO_B).toBe('from-file')
    expect(state.__todoOverKillEnvKeys).toEqual(new Set(['TODO_B']))
  })

  it('drops a key that was removed from .env since the last load', () => {
    writeDotEnv('TODO_A=first\nTODO_B=first\n')
    loadDotEnv('development', root, state)

    writeDotEnv('TODO_A=second\n')
    loadDotEnv('development', root, state)

    expect(process.env.TODO_A).toBe('second')
    expect(process.env.TODO_B).toBeUndefined()
    expect(state.__todoOverKillEnvKeys).toEqual(new Set(['TODO_A']))
  })

  it('does not treat its own earlier values as shell variables', () => {
    vi.stubEnv('TODO_A', 'from-shell')
    writeDotEnv('TODO_B=first\n')
    loadDotEnv('development', root, state)

    writeDotEnv('TODO_A=from-file\nTODO_B=second\n')
    loadDotEnv('development', root, state)

    expect(process.env.TODO_A).toBe('from-shell')
    expect(process.env.TODO_B).toBe('second')
  })

  it('keeps the key set on globalThis by default', () => {
    writeDotEnv('TODO_A=from-file\n')
    const global = globalThis as DotEnvState
    const saved = global.__todoOverKillEnvKeys
    global.__todoOverKillEnvKeys = undefined

    try {
      loadDotEnv('development', root)

      expect(global.__todoOverKillEnvKeys).toEqual(new Set(['TODO_A']))
    } finally {
      global.__todoOverKillEnvKeys = saved
    }
  })
})
