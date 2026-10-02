import { inject } from 'vitest'

// Runs before every test file in both projects, ahead of any import of
// src/env.ts, which reads process.env once when it loads. Both variables point
// at the run's container: src/server/db.ts reads DATABASE_URL_TEST under
// NODE_ENV=test, and DATABASE_URL is required by the schema and must never
// reach the dev database from a test.
const url = inject('testDatabaseUrl')
process.env.DATABASE_URL_TEST = url
process.env.DATABASE_URL = url
