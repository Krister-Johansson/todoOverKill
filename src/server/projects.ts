import type { StatusCategory } from '#/generated/prisma/enums'
import {
  createProjectSchema,
  listProjectsSchema,
  projectIdSchema,
  updateProjectSchema,
} from '#/schemas/project'
import type {
  CreateProjectInput,
  ListProjectsInput,
  UpdateProjectInput,
} from '#/schemas/project'
import { ACTIVITY_TYPES } from '#/server/activity'
import { db } from '#/server/db'
import { ConflictError, NotFoundError, isPrismaError } from '#/server/errors'

/** The columns every new project starts with. The seed uses them too. */
export const DEFAULT_STATUSES = [
  { name: 'Backlog', category: 'todo' },
  { name: 'Todo', category: 'todo' },
  { name: 'In progress', category: 'in_progress' },
  { name: 'Done', category: 'done' },
] as const satisfies ReadonlyArray<{ name: string; category: StatusCategory }>

const withStatuses = {
  statuses: { orderBy: { order: 'asc' } },
} as const

function notFound(id: string) {
  return new NotFoundError(`No project with id ${id}.`)
}

function keyTaken(key: string) {
  return new ConflictError(`Another project already uses the key ${key}.`)
}

// Each function parses its input with the shared schema, so a caller that
// skips validation still gets a trimmed, upper-case key. Invalid input throws
// a ZodError.

/**
 * Creates a project with the default statuses and a `project.created` activity
 * row, in one transaction. Throws ConflictError when the key is taken.
 */
export async function createProject(input: CreateProjectInput) {
  const data = createProjectSchema.parse(input)
  try {
    return await db.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          ...data,
          statuses: {
            create: DEFAULT_STATUSES.map((status, index) => ({
              ...status,
              order: index + 1,
            })),
          },
        },
        include: withStatuses,
      })
      await tx.activity.create({
        data: {
          projectId: project.id,
          type: ACTIVITY_TYPES.projectCreated,
          payload: { name: project.name, key: project.key },
        },
      })
      return project
    })
  } catch (error) {
    if (isPrismaError(error, 'P2002')) throw keyTaken(data.key)
    throw error
  }
}

/** Projects sorted by name. Archived projects are left out unless asked for. */
export async function listProjects(input: ListProjectsInput = {}) {
  const { includeArchived } = listProjectsSchema.parse(input)
  return db.project.findMany({
    where: includeArchived ? undefined : { archivedAt: null },
    orderBy: { name: 'asc' },
  })
}

/** A project with its statuses in board order. Throws NotFoundError. */
export async function getProject(id: string) {
  const projectId = projectIdSchema.parse(id)
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: withStatuses,
  })
  if (!project) throw notFound(projectId)
  return project
}

/**
 * Changes the given fields and leaves the rest alone; `null` clears the
 * description or colour. Throws NotFoundError, or ConflictError when the new
 * key is taken.
 */
export async function updateProject(id: string, patch: UpdateProjectInput) {
  const projectId = projectIdSchema.parse(id)
  const data = updateProjectSchema.parse(patch)
  try {
    return await db.project.update({
      where: { id: projectId },
      data,
      include: withStatuses,
    })
  } catch (error) {
    if (isPrismaError(error, 'P2025')) throw notFound(projectId)
    if (isPrismaError(error, 'P2002') && data.key) throw keyTaken(data.key)
    throw error
  }
}

/**
 * Sets `archivedAt` and writes a `project.archived` activity row. Archiving an
 * archived project changes nothing and writes no second row. Throws
 * NotFoundError.
 */
export async function archiveProject(id: string) {
  const projectId = projectIdSchema.parse(id)
  return db.$transaction(async (tx) => {
    // The archivedAt condition makes the check and the write one statement, so
    // two archives at once cannot both write an activity row.
    const { count } = await tx.project.updateMany({
      where: { id: projectId, archivedAt: null },
      data: { archivedAt: new Date() },
    })
    const project = await tx.project.findUnique({
      where: { id: projectId },
      include: withStatuses,
    })
    if (!project) throw notFound(projectId)
    if (count === 1) {
      await tx.activity.create({
        data: {
          projectId,
          type: ACTIVITY_TYPES.projectArchived,
          payload: { name: project.name, key: project.key },
        },
      })
    }
    return project
  })
}

/**
 * Clears `archivedAt`. Restoring a project that is not archived changes
 * nothing. Throws NotFoundError.
 *
 * Writes no activity row: issue #9 asks for rows on create and archive only.
 */
export async function restoreProject(id: string) {
  const projectId = projectIdSchema.parse(id)
  await db.project.updateMany({
    where: { id: projectId, archivedAt: { not: null } },
    data: { archivedAt: null },
  })
  return getProject(projectId)
}
