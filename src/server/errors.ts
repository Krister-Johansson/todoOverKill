import { Prisma } from '#/generated/prisma/client'

/** The kind of record a NotFoundError is about. */
export type NotFoundEntity =
  'project' | 'task' | 'status' | 'label' | 'subtask' | 'comment'

/**
 * Thrown by a service when the record it was asked for does not exist. REST,
 * MCP, and AI tools map it to their own "not found" response. `entity` says
 * which record was missing where a caller words its message by it, as the
 * create task dialog does.
 */
export class NotFoundError extends Error {
  readonly code = 'not_found'

  constructor(
    message: string,
    readonly entity?: NotFoundEntity,
  ) {
    super(message)
    this.name = 'NotFoundError'
  }
}

/** Thrown by a service when a write would break a unique rule, such as a project key. */
export class ConflictError extends Error {
  readonly code = 'conflict'

  constructor(message: string) {
    super(message)
    this.name = 'ConflictError'
  }
}

/**
 * True when `error` is a Prisma request error with the given code, for example
 * P2002 (unique constraint) or P2025 (record not found).
 */
export function isPrismaError(
  error: unknown,
  code: string,
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  )
}
