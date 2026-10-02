import * as z from 'zod'

import { projectColorName } from '#/lib/project-colors'
import { projectIdFieldSchema } from '#/schemas/project'

export const labelIdSchema = z.string().min(1)

export const labelNameSchema = z
  .string()
  .trim()
  .min(1, { error: 'Name is required.' })
  .max(50, { error: 'Name must be 50 characters or fewer.' })

/**
 * A colour from the project palette, stored in lower case. Only createLabel
 * checks it: labels written another way, such as the seed's until F58 (#81),
 * can hold colours outside the palette, so code that reads a label must not
 * assume its colour is in PROJECT_COLORS.
 */
export const labelColorSchema = z
  .string()
  .toLowerCase()
  .refine((value) => projectColorName(value) !== undefined, {
    error: 'Colour must be one of the project colours.',
  })

export const createLabelSchema = z.object({
  name: labelNameSchema,
  color: labelColorSchema,
})

/** A task's whole label set. Empty clears it. */
export const labelIdsSchema = z
  .array(labelIdSchema)
  .max(50, { error: 'A task can have 50 labels or fewer.' })
  .refine((ids) => new Set(ids).size === ids.length, {
    error: 'Each label may appear only once.',
  })

export type CreateLabelInput = z.input<typeof createLabelSchema>

/**
 * The create_label tool's input: the project id and createLabelSchema's
 * fields. Strict, so a misnamed field is a validation error rather than
 * silently dropped.
 */
export const createLabelToolSchema = z.strictObject({
  projectId: projectIdFieldSchema,
  ...createLabelSchema.shape,
})

export type CreateLabelToolInput = z.input<typeof createLabelToolSchema>

/**
 * A label as a tool returns it. The colour is any string, since a label need
 * not hold a palette colour (see labelColorSchema).
 */
export const labelOutputSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  color: z.string(),
})

export type LabelOutput = z.infer<typeof labelOutputSchema>
