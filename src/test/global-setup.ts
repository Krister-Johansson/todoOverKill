import type { TestProject } from 'vitest/node'

import { prepareTestDatabase } from './prepare-test-database.ts'

declare module 'vitest' {
  export interface ProvidedContext {
    testDatabaseUrl: string
  }
}

/**
 * Vitest global setup: starts and migrates this run's database container once
 * per run, and stops it when the run ends. Global setup runs in the main
 * process, so the URL reaches the workers through provide and inject;
 * src/test/setup-database-url.ts picks it up.
 */
export default async function setup(project: TestProject) {
  const database = await prepareTestDatabase()
  project.provide('testDatabaseUrl', database.url)
  return database.stop
}
