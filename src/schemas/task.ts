import * as z from 'zod'

import { Priority } from '#/generated/prisma/enums'
import { labelIdsSchema, labelOutputSchema } from '#/schemas/label'
import { projectIdFieldSchema } from '#/schemas/project'
import { statusIdSchema, statusOutputSchema } from '#/schemas/status'

export const taskIdSchema = z.string().min(1)

/** The task id as a tool argument, described for the model. */
export const taskIdFieldSchema = taskIdSchema.meta({
  description: 'The id of the task, from list_tasks or search.',
})

export const taskTitleSchema = z
  .string()
  .trim()
  .min(1, { error: 'Title is required.' })
  .max(200, { error: 'Title must be 200 characters or fewer.' })

const descriptionSchema = z
  .string()
  .trim()
  .max(10_000, { error: 'Description must be 10000 characters or fewer.' })

export const taskPrioritySchema = z.enum(Priority, {
  error: 'Priority must be none, low, medium, high, or urgent.',
})

/** A calendar day as YYYY-MM-DD, with no time or zone. */
export const dueDateSchema = z.iso.date({
  error: 'Date must be a calendar day such as 2026-10-01.',
})

/**
 * Without a statusId the task goes into the project's first status. Strict, so
 * a misspelled field is a 400 rather than silently dropped.
 */
export const createTaskSchema = z.strictObject({
  title: taskTitleSchema,
  description: descriptionSchema.nullish(),
  statusId: statusIdSchema.optional(),
  priority: taskPrioritySchema.default('none'),
  dueDate: dueDateSchema.nullish(),
  labelIds: labelIdsSchema.optional(),
})

/**
 * Every field is optional. `null` clears the description or due date, and
 * `labelIds` replaces the whole label set (`[]` clears it). Status and order
 * change through moveTask.
 */
export const updateTaskSchema = z
  .object({
    title: taskTitleSchema,
    description: descriptionSchema.nullable(),
    priority: taskPrioritySchema,
    dueDate: dueDateSchema.nullable(),
    labelIds: labelIdsSchema,
  })
  .partial()

const moveFields = {
  statusId: statusIdSchema.optional(),
  index: z
    .int({ error: 'Index must be a whole number.' })
    .nonnegative({ error: 'Index must be 0 or more.' })
    .optional(),
}

function statusOrIndexGiven(input: { statusId?: string; index?: number }) {
  return input.statusId !== undefined || input.index !== undefined
}

const statusOrIndexError = { error: 'Give a status, an index, or both.' }

/**
 * Moves the task to `statusId` (default: its current status) at `index` among
 * that column's other tasks (default: the end of another status, or its
 * current place when `statusId` is the current status).
 */
export const moveTaskSchema = z
  .object(moveFields)
  .refine(statusOrIndexGiven, statusOrIndexError)

/**
 * The REST PATCH body: the update fields and the move fields together. Every
 * field is optional, so `{}` is valid and changes nothing. Strict, so a body
 * such as `{ status }` (the list filter's name for statusId) is a 400 instead
 * of a 200 that changed nothing.
 */
export const patchTaskSchema = updateTaskSchema.extend(moveFields).strict()

/** Matched against title and description, ignoring case. Blank means no filter. */
export const searchTextSchema = z
  .string()
  .trim()
  .max(200, { error: 'Search text must be 200 characters or fewer.' })
  .optional()
  .transform((q) => q || undefined)

/** The filters besides the search text. */
const listTaskFilterShape = {
  statusId: statusIdSchema.optional(),
  priority: taskPrioritySchema.optional(),
  labelId: z.string().min(1).optional(),
  dueFrom: dueDateSchema.optional(),
  dueTo: dueDateSchema.optional(),
  /** False: only open tasks (no completedAt). True: only completed ones. */
  completed: z.boolean().optional(),
}

function dueRangeInOrder({
  dueFrom,
  dueTo,
}: {
  dueFrom?: string
  dueTo?: string
}) {
  return !dueFrom || !dueTo || dueFrom <= dueTo
}

const dueRangeError = {
  error: 'The start of the due range must not be after its end.',
}

/** Every filter is optional; the ones given must all match. */
export const listTasksSchema = z
  .object({ ...listTaskFilterShape, q: searchTextSchema })
  .refine(dueRangeInOrder, dueRangeError)

/**
 * The list_tasks tool's input: the project id and listTasksSchema's filters.
 * `q` is the search text's input side, a trimmed optional string, so the
 * schema has no transform and converts to JSON Schema in both of
 * z.toJSONSchema's modes. listTasks still parses it with listTasksSchema, which
 * turns blank text into no filter. Strict, so a REST-style name such as
 * `status` is a validation error rather than an unfiltered list.
 */
export const listTasksToolSchema = z
  .strictObject({
    projectId: projectIdFieldSchema,
    ...listTaskFilterShape,
    q: searchTextSchema.in,
  })
  .refine(dueRangeInOrder, dueRangeError)

// The write tools' inputs: the id the service takes as its first argument,
// beside the fields of the schema the service parses the rest with. Strict, so
// a misnamed field is a validation error rather than a change silently dropped.

/** The create_task tool's input: the project id and createTaskSchema's fields. */
export const createTaskToolSchema = z.strictObject({
  projectId: projectIdFieldSchema,
  ...createTaskSchema.shape,
})

/** The update_task tool's input: the task id and updateTaskSchema's fields. */
export const updateTaskToolSchema = z.strictObject({
  taskId: taskIdFieldSchema,
  ...updateTaskSchema.shape,
})

/** The move_task tool's input: the task id and moveTaskSchema's fields. */
export const moveTaskToolSchema = z
  .strictObject({ taskId: taskIdFieldSchema, ...moveFields })
  .refine(statusOrIndexGiven, statusOrIndexError)

/** The input of a tool that takes only a task id. */
export const taskIdToolSchema = z.strictObject({ taskId: taskIdFieldSchema })

/**
 * The due presets the filters offer. Overdue is due before today and not
 * completed; week is today and the six days after it.
 */
export const dueFilterSchema = z.enum(['overdue', 'today', 'week'], {
  error: 'Due must be overdue, today, or week.',
})

/**
 * A query parameter where an empty value means absent: an HTML GET form and
 * the filter bar send `?priority=` for a filter nobody picked.
 */
function queryParam<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => (value === '' ? undefined : value), schema)
}

/**
 * The REST list query, with F23's filter names. The route turns `due` into a
 * due range for listTasks. Strict, so an unknown filter such as `?statusId=`
 * is a 400 rather than an unfiltered list.
 */
export const listTasksQuerySchema = z.strictObject({
  status: queryParam(statusIdSchema.optional()),
  priority: queryParam(taskPrioritySchema.optional()),
  label: queryParam(z.string().min(1).optional()),
  due: queryParam(dueFilterSchema.optional()),
  q: queryParam(searchTextSchema),
})

// Input types, because the services parse what they are given.
export type CreateTaskInput = z.input<typeof createTaskSchema>
export type UpdateTaskInput = z.input<typeof updateTaskSchema>
export type MoveTaskInput = z.input<typeof moveTaskSchema>
export type ListTasksInput = z.input<typeof listTasksSchema>
export type PatchTaskInput = z.input<typeof patchTaskSchema>
export type ListTasksQuery = z.input<typeof listTasksQuerySchema>
export type ListTasksToolInput = z.input<typeof listTasksToolSchema>
export type CreateTaskToolInput = z.input<typeof createTaskToolSchema>
export type UpdateTaskToolInput = z.input<typeof updateTaskToolSchema>
export type MoveTaskToolInput = z.input<typeof moveTaskToolSchema>
export type DueFilter = z.infer<typeof dueFilterSchema>

/**
 * A task as a tool returns it: getTask's shape after JSON, so timestamps are
 * ISO strings, the due date is YYYY-MM-DD, and labels are sorted by name.
 */
export const taskOutputSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  statusId: z.string(),
  number: z.int(),
  title: z.string(),
  description: z.string().nullable(),
  priority: taskPrioritySchema,
  dueDate: dueDateSchema.nullable(),
  order: z.number(),
  completedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  status: statusOutputSchema,
  labels: z.array(labelOutputSchema),
})

export type TaskOutput = z.infer<typeof taskOutputSchema>

/**
 * The create task dialog's values. The inputs hold strings, so an empty
 * description, status, or due date means none; toCreateTaskInput turns them
 * into createTaskSchema's input. An empty status leaves the choice to the
 * service, which reports a project without statuses as a conflict.
 */
export const createTaskFormSchema = z.object({
  title: taskTitleSchema,
  description: descriptionSchema,
  statusId: z.string(),
  priority: taskPrioritySchema,
  dueDate: z
    .string()
    .refine((day) => day === '' || dueDateSchema.safeParse(day).success, {
      error: 'Date must be a calendar day such as 2026-10-01.',
    }),
})

export type CreateTaskFormValues = z.input<typeof createTaskFormSchema>

/** Only the keys createTaskSchema knows, with empty strings left out. */
export function toCreateTaskInput(
  values: CreateTaskFormValues,
): CreateTaskInput {
  return {
    title: values.title,
    description: values.description.trim() || undefined,
    statusId: values.statusId || undefined,
    priority: values.priority,
    dueDate: values.dueDate || undefined,
  }
}
