// @vitest-environment node
// Server code runs without `window`. Under jsdom, t3-env treats the module as
// client code and blocks every server variable.
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getAssistantStatus } from '#/server/assistant'

const env = vi.hoisted(() => ({
  OPENROUTER_API_KEY: undefined as string | undefined,
  OPENROUTER_MODEL: 'openai/gpt-4o-mini',
}))

vi.mock('#/env', () => ({ env }))

describe('getAssistantStatus', () => {
  beforeEach(() => {
    env.OPENROUTER_API_KEY = undefined
  })

  it('is off without a key', () => {
    expect(getAssistantStatus()).toEqual({
      enabled: false,
      model: 'openai/gpt-4o-mini',
    })
  })

  it('is on with a key, and never returns the key', () => {
    env.OPENROUTER_API_KEY = 'test-key'
    const status = getAssistantStatus()
    expect(status).toEqual({ enabled: true, model: 'openai/gpt-4o-mini' })
    expect(JSON.stringify(status)).not.toContain('test-key')
  })
})
