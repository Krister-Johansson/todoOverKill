import { prepareTestDatabase } from './prepare-test-database.ts'

/** Vitest global setup: migrates the test database once per run. */
export default prepareTestDatabase
