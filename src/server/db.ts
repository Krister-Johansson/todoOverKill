import { PrismaPg } from '@prisma/adapter-pg'

import { env } from '#/env'
import { PrismaClient } from '#/generated/prisma/client'

/** Vitest sets NODE_ENV to test, so unit tests never touch the app database. */
function databaseUrl() {
  return process.env.NODE_ENV === 'test'
    ? env.DATABASE_URL_TEST
    : env.DATABASE_URL
}

export function createPrismaClient(connectionString: string) {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
}

// Vite re-evaluates server modules on every dev reload. Keeping the client on
// globalThis stops each reload from opening another connection pool.
const cache = globalThis as typeof globalThis & {
  __todoOverKillDb?: PrismaClient
}

export const db = cache.__todoOverKillDb ?? createPrismaClient(databaseUrl())

if (process.env.NODE_ENV !== 'production') cache.__todoOverKillDb = db
