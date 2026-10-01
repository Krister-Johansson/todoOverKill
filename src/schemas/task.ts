import * as z from 'zod'

import { Priority } from '#/generated/prisma/enums'
import { statusIdSchema } from '#/schemas/status'

export const taskIdSchema = z.string().min(1)

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
})

/**
 * Every field is optional. `null` clears the description or due date. Status
 * and order change through moveTask.
 */
export const updateTaskSchema = z
  .object({
    title: taskTitleSchema,
    description: descriptionSchema.nullable(),
    priority: taskPrioritySchema,
    dueDate: dueDateSchema.nullable(),
  })
  .partial()

const moveFields = {
  statusId: statusIdSchema.optional(),
  index: z
    .int({ error: 'Index must be a whole number.' })
    .nonnegative({ error: 'Index must be 0 or more.' })
    .optional(),
}

/**
 * Moves the task to `statusId` (default: its current status) at `index` among
 * that column's other tasks (default: the end of another status, or its
 * current place when `statusId` is the current status).
 */
export const moveTaskSchema = z
  .object(moveFields)
  .refine(
    (input) => input.statusId !== undefined || input.index !== undefined,
    { error: 'Give a status, an index, or both.' },
  )

/**
 * The REST PATCH body: the update fields and the move fields together. Every
 * field is optional, so `{}` is valid and changes nothing. Strict, so a body
 * such as `{ status }` (the list filter's name for statusId) is a 400 instead
 * of a 200 that changed nothing.
 */
export const patchTaskSchema = updateTaskSchema.extend(moveFields).strict()

/** Matched against title and description, ignoring case. Blank means no filter. */
const searchTextSchema = z
  .string()
  .trim()
  .max(200, { error: 'Search text must be 200 characters or fewer.' })
  .optional()
  .transform((q) => q || undefined)

/** Every filter is optional; the ones given must all match. */
export const listTasksSchema = z
  .object({
    statusId: statusIdSchema.optional(),
    priority: taskPrioritySchema.optional(),
    labelId: z.string().min(1).optional(),
    dueFrom: dueDateSchema.optional(),
    dueTo: dueDateSchema.optional(),
    /** False: only open tasks (no completedAt). True: only completed ones. */
    completed: z.boolean().optional(),
    q: searchTextSchema,
  })
  .refine(({ dueFrom, dueTo }) => !dueFrom || !dueTo || dueFrom <= dueTo, {
    error: 'The start of the due range must not be after its end.',
  })

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
export type DueFilter = z.infer<typeof dueFilterSchema>

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
