import { createLabelSchema, labelIdSchema } from '#/schemas/label'
import type { CreateLabelInput } from '#/schemas/label'
import { projectIdSchema } from '#/schemas/project'
import { db } from '#/server/db'
import { ConflictError, NotFoundError, isPrismaError } from '#/server/errors'

function projectNotFound(id: string) {
  return new NotFoundError(`No project with id ${id}.`)
}

function labelNotFound(id: string) {
  return new NotFoundError(`No label with id ${id}.`)
}

// Label changes write no activity rows: ACTIVITY_TYPES has no label types, as
// it has none for statuses. Attaching labels to a task is a task.updated row,
// written by the tasks service.

/** A project's labels sorted by name. Throws NotFoundError. */
export async function listLabels(projectId: string) {
  const id = projectIdSchema.parse(projectId)
  const project = await db.project.findUnique({
    where: { id },
    select: { labels: { orderBy: { name: 'asc' } } },
  })
  if (!project) throw projectNotFound(id)
  return project.labels
}

/**
 * Creates a label with a palette colour. Throws NotFoundError for an unknown
 * project and ConflictError when the project already has a label of that name.
 */
export async function createLabel(projectId: string, input: CreateLabelInput) {
  const id = projectIdSchema.parse(projectId)
  const data = createLabelSchema.parse(input)
  try {
    return await db.label.create({
      data: { ...data, project: { connect: { id } } },
    })
  } catch (error) {
    if (isPrismaError(error, 'P2025')) throw projectNotFound(id)
    if (isPrismaError(error, 'P2002')) {
      throw new ConflictError(
        `A label named ${data.name} already exists in this project.`,
      )
    }
    throw error
  }
}

/**
 * Deletes the label and returns it. The tasks that had it lose it (the
 * TaskLabel rows cascade) and are otherwise untouched. Throws NotFoundError.
 */
export async function deleteLabel(id: string) {
  const labelId = labelIdSchema.parse(id)
  try {
    return await db.label.delete({ where: { id: labelId } })
  } catch (error) {
    if (isPrismaError(error, 'P2025')) throw labelNotFound(labelId)
    throw error
  }
}
