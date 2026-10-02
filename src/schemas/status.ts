import * as z from 'zod'

import { StatusCategory } from '#/generated/prisma/enums'

export const statusIdSchema = z.string().min(1)

export const statusNameSchema = z
  .string()
  .trim()
  .min(1, { error: 'Name is required.' })
  .max(50, { error: 'Name must be 50 characters or fewer.' })

export const statusCategorySchema = z.enum(StatusCategory, {
  error: 'Category must be todo, in_progress, or done.',
})

export const createStatusSchema = z.object({
  name: statusNameSchema,
  category: statusCategorySchema,
})

export const renameStatusSchema = z.object({
  name: statusNameSchema,
})

/** Every status id of the project, in the new board order. */
export const reorderStatusesSchema = z.object({
  statusIds: z
    .array(statusIdSchema)
    .min(1, { error: 'Give at least one status.' })
    .refine((ids) => new Set(ids).size === ids.length, {
      error: 'Each status may appear only once.',
    }),
})

export type CreateStatusInput = z.input<typeof createStatusSchema>
export type RenameStatusInput = z.input<typeof renameStatusSchema>
export type ReorderStatusesInput = z.input<typeof reorderStatusesSchema>

/** A status as a tool returns it. `order` sorts the board's columns. */
export const statusOutputSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  order: z.number(),
  category: statusCategorySchema,
})

export type StatusOutput = z.infer<typeof statusOutputSchema>
