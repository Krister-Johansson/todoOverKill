// @vitest-environment node
// jsdom defines `window`, which makes t3-env treat the run as client-side and
// skip validation of server variables.
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

  it('names a missing DATABASE_URL and points at .env.example', async () => {
    vi.stubEnv('DATABASE_URL', undefined)

    const error = await loadEnv().catch((e: unknown) => e)

    expect(error).toBeInstanceOf(Error)
    const { message } = error as Error
    expect(message).toContain('  - DATABASE_URL: is required')
    expect(message).toContain('.env.example')
    expect(message).not.toContain('DATABASE_URL_TEST')
  })

  it('names a missing DATABASE_URL_TEST', async () => {
    vi.stubEnv('DATABASE_URL_TEST', undefined)

    await expect(loadEnv()).rejects.toThrow(
      '  - DATABASE_URL_TEST: is required',
    )
  })

  it('rejects a value that is not a URL', async () => {
    vi.stubEnv('DATABASE_URL', 'not-a-url')

    await expect(loadEnv()).rejects.toThrow(
      '  - DATABASE_URL: must be a postgresql:// URL',
    )
  })

  it('rejects a URL with a scheme other than postgres', async () => {
    vi.stubEnv('DATABASE_URL_TEST', 'http://localhost:5434/todo_over_kill')

    await expect(loadEnv()).rejects.toThrow(
      '  - DATABASE_URL_TEST: must be a postgresql:// URL',
    )
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

  it('passes a configured model through', async () => {
    vi.stubEnv('OPENROUTER_MODEL', 'anthropic/claude-sonnet-4')

    const env = await loadEnv()

    expect(env.OPENROUTER_MODEL).toBe('anthropic/claude-sonnet-4')
  })
})
