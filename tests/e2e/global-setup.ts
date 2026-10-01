import { prepareTestDatabase } from '../../src/test/prepare-test-database.ts'
import { createTestPrismaClient, resetDatabase } from '../../src/test/db.ts'

/**
 * Migrates the test database and empties it, once per run rather than once
 * per spec. Specs that write data must clean up after themselves or use names
 * no other spec uses. The returned function is Playwright's global teardown.
 */
export default async function globalSetup() {
  const teardown = await prepareTestDatabase()
  const client = createTestPrismaClient()
  try {
    await resetDatabase(client)
  } catch (error) {
    teardown()
    throw error
  } finally {
    await client.$disconnect()
  }
  return teardown
}
