import { projectIdSchema } from '#/schemas/project'
import {
  createStatusSchema,
  renameStatusSchema,
  reorderStatusesSchema,
  statusIdSchema,
} from '#/schemas/status'
import type {
  CreateStatusInput,
  RenameStatusInput,
  ReorderStatusesInput,
} from '#/schemas/status'
import { db } from '#/server/db'
import { ConflictError, NotFoundError, isPrismaError } from '#/server/errors'

function projectNotFound(id: string) {
  return new NotFoundError(`No project with id ${id}.`)
}

function statusNotFound(id: string) {
  return new NotFoundError(`No status with id ${id}.`)
}

function statusInUse(name: string, taskCount?: number) {
  const tasks =
    taskCount === undefined
      ? 'Tasks still use'
      : `${taskCount} ${taskCount === 1 ? 'task still uses' : 'tasks still use'}`
  return new ConflictError(
    `${tasks} the status ${name}. Move its tasks to another status first.`,
  )
}

// Status changes write no activity rows: ACTIVITY_TYPES has no status types and
// issue #11 asks for none.

/** A project's statuses in board order. Throws NotFoundError. */
export async function listStatuses(projectId: string) {
  const id = projectIdSchema.parse(projectId)
  const project = await db.project.findUnique({
    where: { id },
    select: { statuses: { orderBy: { order: 'asc' } } },
  })
  if (!project) throw projectNotFound(id)
  return project.statuses
}

/**
 * Adds a status after the project's last one. Archived projects accept new
 * statuses too. Throws NotFoundError for an unknown project.
 */
export async function addStatus(projectId: string, input: CreateStatusInput) {
  const id = projectIdSchema.parse(projectId)
  const data = createStatusSchema.parse(input)
  return db.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id },
      select: { id: true },
    })
    if (!project) throw projectNotFound(id)
    // Under read committed, two adds at once can read the same maximum and
    // store the same order. That is acceptable for a single-user app, and the
    // next reorderStatuses rewrites every order anyway.
    const { _max } = await tx.status.aggregate({
      where: { projectId: id },
      _max: { order: true },
    })
    return tx.status.create({
      data: { ...data, projectId: id, order: (_max.order ?? 0) + 1 },
    })
  })
}

/** Changes the name and nothing else. Throws NotFoundError. */
export async function renameStatus(id: string, input: RenameStatusInput) {
  const statusId = statusIdSchema.parse(id)
  const data = renameStatusSchema.parse(input)
  try {
    return await db.status.update({ where: { id: statusId }, data })
  } catch (error) {
    if (isPrismaError(error, 'P2025')) throw statusNotFound(statusId)
    throw error
  }
}

/**
 * Sets the board order to `statusIds`, writing order 1..n. The list must hold
 * every status of the project exactly once; anything else, such as a list from
 * a client that missed an add or delete, throws ConflictError. Throws
 * NotFoundError for an unknown project.
 */
export async function reorderStatuses(
  projectId: string,
  input: ReorderStatusesInput,
) {
  const id = projectIdSchema.parse(projectId)
  const { statusIds } = reorderStatusesSchema.parse(input)
  return db.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id },
      select: { statuses: { select: { id: true } } },
    })
    if (!project) throw projectNotFound(id)
    const current = new Set(project.statuses.map((status) => status.id))
    const matches =
      statusIds.length === current.size &&
      statusIds.every((statusId) => current.has(statusId))
    if (!matches) {
      throw new ConflictError(
        'The status list does not match the project. Reload and try again.',
      )
    }
    for (const [index, statusId] of statusIds.entries()) {
      await tx.status.update({
        where: { id: statusId },
        data: { order: index + 1 },
      })
    }
    return tx.status.findMany({
      where: { projectId: id },
      orderBy: { order: 'asc' },
    })
  })
}

/**
 * Deletes a status that no task uses. Throws ConflictError when tasks still
 * use it, and NotFoundError for an unknown id. A project may lose its last
 * status. The remaining statuses keep their order values.
 */
export async function deleteStatus(id: string) {
  const statusId = statusIdSchema.parse(id)
  let name = statusId
  try {
    return await db.$transaction(async (tx) => {
      const status = await tx.status.findUnique({
        where: { id: statusId },
        include: { _count: { select: { tasks: true } } },
      })
      if (!status) throw statusNotFound(statusId)
      name = status.name
      if (status._count.tasks > 0) {
        throw statusInUse(status.name, status._count.tasks)
      }
      const { _count, ...deleted } = status
      await tx.status.delete({ where: { id: statusId } })
      return deleted
    })
  } catch (error) {
    // A task created between the count and the delete trips the RESTRICT
    // foreign key. The failed statement aborts the transaction, so the catch
    // sits outside it.
    if (isPrismaError(error, 'P2003')) throw statusInUse(name)
    throw error
  }
}
