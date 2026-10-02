// @vitest-environment node
// Server code runs without `window`. Under jsdom, t3-env treats the module as
// client code and blocks every server variable, which one test relies on.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const APP_URL = 'postgresql://todo:todo@localhost:5434/todo_over_kill'
const TEST_URL = 'postgresql://todo:todo@localhost:5434/todo_over_kill_test'

async function loadEnv() {
  vi.resetModules()
  const { env } = await import('#/env')
  return env
}

describe('env', () => {
  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', APP_URL)
    vi.stubEnv('DATABASE_URL_TEST', TEST_URL)
    vi.stubEnv('OPENROUTER_API_KEY', undefined)
    vi.stubEnv('OPENROUTER_MODEL', undefined)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('reads server variables on the server', async () => {
    const env = await loadEnv()

    expect(env.DATABASE_URL).toBe(APP_URL)
  })

  it('blocks server variables in client code', async () => {
    vi.stubGlobal('window', {})

    try {
      // Not through loadEnv: resolving a promise with the env object reads its
      // `then` property, which the client guard also blocks.
      vi.resetModules()
      const module = await import('#/env')

      expect(() => module.env.DATABASE_URL).toThrow(
        /server-side environment variable/,
      )
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('names a missing DATABASE_URL and points at .env.example', async () => {
    vi.stubEnv('DATABASE_URL', undefined)

    const error = await loadEnv().catch((e: unknown) => e)

    expect(error).toBeInstanceOf(Error)
    const { message } = error as Error
    expect(message).toContain('  - DATABASE_URL: is required')
    expect(message).toContain('.env.example')
    expect(message).not.toContain('DATABASE_URL_TEST')
  })

  it('accepts a missing DATABASE_URL_TEST', async () => {
    vi.stubEnv('DATABASE_URL_TEST', undefined)

    const env = await loadEnv()

    expect(env.DATABASE_URL_TEST).toBeUndefined()
  })

  it('says where DATABASE_URL_TEST comes from when a test server lacks it', async () => {
    // vite.config.ts validates the schema on preview, which now passes, so
    // the first database access is where a preview with NODE_ENV=test and no
    // DATABASE_URL_TEST stops.
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('DATABASE_URL_TEST', undefined)
    const cache = globalThis as { __todoOverKillDb?: unknown }
    const cached = cache.__todoOverKillDb
    delete cache.__todoOverKillDb

    try {
      vi.resetModules()
      await expect(import('#/server/db')).rejects.toThrow(
        'DATABASE_URL_TEST is not set and NODE_ENV is test.',
      )
    } finally {
      // If the import ever stops throwing, it leaves a new client here. Close
      // its pool, so the failed assertion is the only thing left behind.
      const created = cache.__todoOverKillDb as
        { $disconnect: () => Promise<void> } | undefined
      if (created && created !== cached) await created.$disconnect()
      cache.__todoOverKillDb = cached
    }
  })

  it('rejects a value that is not a URL', async () => {
    vi.stubEnv('DATABASE_URL', 'not-a-url')

    await expect(loadEnv()).rejects.toThrow(
      '  - DATABASE_URL: must be a postgresql:// URL with a host',
    )
  })

  it('rejects a URL with a scheme other than postgres', async () => {
    vi.stubEnv('DATABASE_URL_TEST', 'http://localhost:5434/todo_over_kill')

    await expect(loadEnv()).rejects.toThrow(
      '  - DATABASE_URL_TEST: must be a postgresql:// URL with a host',
    )
  })

  it('rejects a postgres URL without a host', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql:///todo_over_kill')

    await expect(loadEnv()).rejects.toThrow(
      '  - DATABASE_URL: must be a postgresql:// URL with a host',
    )
  })

  it('reports one problem per variable', async () => {
    vi.stubEnv('DATABASE_URL', 'mysql:///todo')

    const error = await loadEnv().catch((e: unknown) => e)

    expect((error as Error).message.match(/ {2}- DATABASE_URL:/g)).toHaveLength(
      1,
    )
  })

  it('accepts a Unix socket given as a host query parameter', async () => {
    const socketUrl =
      'postgresql://todo@/todo_over_kill?host=/var/run/postgresql'
    vi.stubEnv('DATABASE_URL', socketUrl)

    const env = await loadEnv()

    expect(env.DATABASE_URL).toBe(socketUrl)
  })

  it.each([
    ['a trailing space', `${APP_URL} `],
    ['a carriage return', `${APP_URL}\r`],
    ['a tab', `postgresql://todo:todo@local\thost:5434/todo_over_kill`],
  ])('rejects a URL with %s instead of trimming it', async (_, value) => {
    vi.stubEnv('DATABASE_URL', value)

    await expect(loadEnv()).rejects.toThrow(
      '  - DATABASE_URL: must not contain spaces or line breaks',
    )
  })

  it('says that shell variables override .env', async () => {
    vi.stubEnv('DATABASE_URL', undefined)

    await expect(loadEnv()).rejects.toThrow(
      'Variables exported in your shell override .env.',
    )
  })

  it('names its error so vite.config.ts can recognise it', async () => {
    vi.stubEnv('DATABASE_URL', undefined)

    await expect(loadEnv()).rejects.toMatchObject({
      name: 'InvalidEnvironmentError',
    })
  })

  it('accepts the postgres:// scheme', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://todo:todo@localhost:5434/todo')

    const env = await loadEnv()

    expect(env.DATABASE_URL).toBe('postgres://todo:todo@localhost:5434/todo')
  })

  it('treats an empty API key as unset and defaults the model', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '')

    const env = await loadEnv()

    expect(env.OPENROUTER_API_KEY).toBeUndefined()
    expect(env.OPENROUTER_MODEL).toBe('openai/gpt-4o-mini')
  })

  it('leaves empty variables in process.env alone', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '')
    vi.stubEnv('HTTP_PROXY', '')

    await loadEnv()

    expect(process.env.OPENROUTER_API_KEY).toBe('')
    expect(process.env.HTTP_PROXY).toBe('')
  })

  it('passes a configured model through', async () => {
    vi.stubEnv('OPENROUTER_MODEL', 'anthropic/claude-sonnet-4')

    const env = await loadEnv()

    expect(env.OPENROUTER_MODEL).toBe('anthropic/claude-sonnet-4')
  })
})
