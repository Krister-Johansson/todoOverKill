import { createEnv } from '@t3-oss/env-core'

// Variables are added in F02 (DATABASE_URL, OPENROUTER_*). The schema stays
// empty until then so lint, typecheck, and build run without a .env file.
export const env = createEnv({
  server: {},

  /**
   * The prefix that client-side variables must have. This is enforced both at
   * a type-level and at runtime.
   */
  clientPrefix: 'VITE_',

  client: {},

  /**
   * What object holds the environment variables at runtime. This is usually
   * `process.env` or `import.meta.env`.
   */
  runtimeEnv: import.meta.env,

  /**
   * Treat empty strings as undefined so that `KEY=` in a .env file falls back
   * to the schema default instead of failing validation.
   */
  emptyStringAsUndefined: true,
})
