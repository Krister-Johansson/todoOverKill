import * as z from 'zod'

/**
 * The activity type strings, the same values as ACTIVITY_TYPES in
 * src/server/activity.ts. That file reads the database, so browser code takes
 * the types from here; src/schemas/activity.test.ts keeps the two lists equal.
 */
export const activityTypeSchema = z.enum([
  'project.created',
  'project.archived',
  'task.created',
  'task.updated',
  'task.moved',
  'task.completed',
  'task.deleted',
  'comment.added',
  'subtask.added',
  'subtask.updated',
  'subtask.completed',
  'subtask.reopened',
  'subtask.moved',
  'subtask.deleted',
])

export type ActivityTypeName = z.infer<typeof activityTypeSchema>

// The payloads are loose: a row keeps whatever its writer stored, and the
// seed leaves out the number on task.moved and task.completed.
const taskNumberSchema = z.number().int().optional()

export const activityPayloadSchemas = {
  'project.created': z.looseObject({ name: z.string(), key: z.string() }),
  'project.archived': z.looseObject({ name: z.string(), key: z.string() }),
  'task.created': z.looseObject({
    number: taskNumberSchema,
    title: z.string(),
  }),
  'task.updated': z.looseObject({
    number: taskNumberSchema,
    fields: z.array(z.string()).min(1),
  }),
  'task.moved': z.looseObject({
    number: taskNumberSchema,
    from: z.string(),
    to: z.string(),
  }),
  'task.completed': z.looseObject({ number: taskNumberSchema }),
  'task.deleted': z.looseObject({
    number: taskNumberSchema,
    title: z.string(),
  }),
  'comment.added': z.looseObject({ body: z.string().optional() }),
  // The seed's subtask.added rows hold only the title.
  'subtask.added': z.looseObject({
    number: taskNumberSchema,
    title: z.string(),
  }),
  // `done` is the new value, written only when `fields` names it.
  'subtask.updated': z.looseObject({
    number: taskNumberSchema,
    title: z.string(),
    fields: z.array(z.string()).min(1),
    done: z.boolean().optional(),
  }),
  'subtask.completed': z.looseObject({
    number: taskNumberSchema,
    title: z.string(),
  }),
  'subtask.reopened': z.looseObject({
    number: taskNumberSchema,
    title: z.string(),
  }),
  'subtask.moved': z.looseObject({
    number: taskNumberSchema,
    title: z.string(),
    from: z.number().int(),
    to: z.number().int(),
  }),
  'subtask.deleted': z.looseObject({
    number: taskNumberSchema,
    title: z.string(),
  }),
} satisfies Record<ActivityTypeName, z.ZodType>

/**
 * One row as listTaskActivity returns it. The type is any string, so a row
 * from a newer writer still reaches the fallback sentence. createdAt is a
 * Date, which the server function's serializer keeps.
 */
export const activityRowSchema = z.object({
  id: z.string(),
  type: z.string(),
  payload: z.unknown(),
  createdAt: z.date(),
})

export type ActivityRow = z.infer<typeof activityRowSchema>
