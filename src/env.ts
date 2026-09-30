import { createEnv } from '@t3-oss/env-core'
import * as z from 'zod'

const postgresUrl = () =>
  z.url({
    protocol: /^postgres(ql)?$/,
    hostname: /.+/,
    error: (issue) =>
      issue.input === undefined
        ? 'is required'
        : 'must be a postgresql:// URL with a host',
  })

export const env = createEnv({
  server: {
    DATABASE_URL: postgresUrl(),
    DATABASE_URL_TEST: postgresUrl(),
    OPENROUTER_API_KEY: z.string().min(1).optional(),
    OPENROUTER_MODEL: z.string().min(1).default('openai/gpt-4o-mini'),
  },

  /**
   * The prefix that client-side variables must have. This is enforced both at
   * a type-level and at runtime.
   */
  clientPrefix: 'VITE_',

  client: {},

  /**
   * Server variables have no VITE_ prefix, so they never reach
   * `import.meta.env`. vite.config.ts loads .env into `process.env`.
   * The copy matters: emptyStringAsUndefined deletes keys from this object,
   * and the global process.env is shared with Vite and its plugins. The guard
   * keeps the module loadable in the browser, where `process` does not exist
   * and t3-env blocks access to server variables instead.
   */
  runtimeEnv: typeof process === 'undefined' ? {} : { ...process.env },

  /**
   * Treat empty strings as undefined so that `KEY=` in a .env file falls back
   * to the schema default instead of failing validation.
   */
  emptyStringAsUndefined: true,

  onValidationError: (issues) => {
    const lines = issues.map((issue) => {
      const segment = issue.path?.[0]
      const name =
        segment === undefined
          ? '(root)'
          : String(typeof segment === 'object' ? segment.key : segment)
      return `  - ${name}: ${issue.message}`
    })
    // Callers print the message: vite.config.ts on dev and preview, Node's
    // uncaught error output for the built server.
    const error = new Error(
      [
        'Invalid environment variables:',
        ...lines,
        'Copy .env.example to .env and fill in the values.',
      ].join('\n'),
    )
    // vite.config.ts checks the name to tell this apart from other failures.
    error.name = 'InvalidEnvironmentError'
    throw error
  },
})
