import { createEnv } from '@t3-oss/env-core'
import * as z from 'zod'

/**
 * Returns the problem with a PostgreSQL connection URL, or undefined when it is
 * fine. The check runs on the raw string and the schema passes it through
 * unchanged, so `env.DATABASE_URL` and `process.env.DATABASE_URL` (which Prisma
 * and pg read) never differ.
 */
function postgresUrlProblem(value: string) {
  // The URL parser drops surrounding spaces, tabs, and line breaks, so a stray
  // space or a Windows line ending in .env would pass here and reach Prisma.
  if (/\s/.test(value)) return 'must not contain spaces or line breaks'
  // libpq allows `postgresql://user@/db?host=/socket/dir`, which the URL parser
  // rejects because of the empty host after the credentials. They do not
  // affect the checks below, so drop them before parsing.
  const url = URL.parse(value.replace(/^([a-z]+:\/\/)[^/?#]*@/i, '$1'))
  const valid =
    url !== null &&
    (url.protocol === 'postgresql:' || url.protocol === 'postgres:') &&
    (url.hostname !== '' || Boolean(url.searchParams.get('host')))
  return valid ? undefined : 'must be a postgresql:// URL with a host'
}

const postgresUrl = () =>
  z
    .string({
      error: (issue) =>
        issue.input === undefined ? 'is required' : 'must be a string',
    })
    .superRefine((value, ctx) => {
      const problem = postgresUrlProblem(value)
      if (problem) ctx.addIssue({ code: 'custom', message: problem })
    })

export const env = createEnv({
  server: {
    DATABASE_URL: postgresUrl(),
    // Optional: the test runs set it to their own container's URL, and
    // src/server/db.ts says so when it is missing under NODE_ENV=test.
    DATABASE_URL_TEST: postgresUrl().optional(),
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
        'pnpm dev and pnpm preview read .env: copy .env.example to .env and',
        'fill in the values. Variables exported in your shell override .env.',
        'Anything else that loads the built dist/server/server.js does not',
        'read .env and must set the variables itself, for example with',
        'node --env-file=.env.',
      ].join('\n'),
    )
    // vite.config.ts checks the name to tell this apart from other failures.
    error.name = 'InvalidEnvironmentError'
    throw error
  },
})
