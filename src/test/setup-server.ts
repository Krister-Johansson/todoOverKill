import { afterAll, beforeAll } from 'vitest'

import { db } from '#/server/db'
import { resetDatabase } from '#/test/db'

// Runs in every file of the server project. Files run one at a time there, so
// each starts with empty tables and cannot see another file's rows.
beforeAll(() => resetDatabase(db))

afterAll(() => db.$disconnect())
