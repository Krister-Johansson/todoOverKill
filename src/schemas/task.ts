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

/** Without a statusId the task goes into the project's first status. */
export const createTaskSchema = z.object({
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

/**
 * Moves the task to `statusId` (default: its current status) at `index` among
 * that column's other tasks (default: the end).
 */
export const moveTaskSchema = z
  .object({
    statusId: statusIdSchema.optional(),
    index: z
      .int({ error: 'Index must be a whole number.' })
      .nonnegative({ error: 'Index must be 0 or more.' })
      .optional(),
  })
  .refine(
    (input) => input.statusId !== undefined || input.index !== undefined,
    { error: 'Give a status, an index, or both.' },
  )

/** Every filter is optional; the ones given must all match. */
export const listTasksSchema = z
  .object({
    statusId: statusIdSchema.optional(),
    priority: taskPrioritySchema.optional(),
    labelId: z.string().min(1).optional(),
    dueFrom: dueDateSchema.optional(),
    dueTo: dueDateSchema.optional(),
    /** Matched against title and description, ignoring case. Blank means no filter. */
    q: z
      .string()
      .trim()
      .max(200, { error: 'Search text must be 200 characters or fewer.' })
      .optional()
      .transform((q) => q || undefined),
  })
  .refine(({ dueFrom, dueTo }) => !dueFrom || !dueTo || dueFrom <= dueTo, {
    error: 'The start of the due range must not be after its end.',
  })

// Input types, because the services parse what they are given.
export type CreateTaskInput = z.input<typeof createTaskSchema>
export type UpdateTaskInput = z.input<typeof updateTaskSchema>
export type MoveTaskInput = z.input<typeof moveTaskSchema>
export type ListTasksInput = z.input<typeof listTasksSchema>
