import { defineConfig } from 'prisma/config'

import { loadDotEnv } from './src/lib/load-dot-env.ts'

// Same loader as vite.config.ts, so variables exported in the shell win over
// .env. The test global setup relies on that to point migrations at
// DATABASE_URL_TEST.
loadDotEnv('development', process.cwd())

// Not the env() helper from prisma/config: it throws while the config loads,
// which would break `prisma generate` (and so `pnpm install`) on a clone with
// no .env. Without a datasource URL, generate still runs and the commands that
// need a database fail with Prisma's own message. An empty value counts as
// unset, as in src/env.ts.
const url = process.env.DATABASE_URL || undefined

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // tsx, not plain node: the seed imports #/server/db, which imports #/env
    // and #/generated/prisma/client without file extensions, and Node adds no
    // extensions when it resolves subpath imports.
    seed: 'tsx prisma/seed.ts',
  },
  ...(url ? { datasource: { url } } : {}),
})
