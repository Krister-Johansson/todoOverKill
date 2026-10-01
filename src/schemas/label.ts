import * as z from 'zod'

import { PROJECT_COLORS } from '#/lib/project-colors'

export const labelIdSchema = z.string().min(1)

export const labelNameSchema = z
  .string()
  .trim()
  .min(1, { error: 'Name is required.' })
  .max(50, { error: 'Name must be 50 characters or fewer.' })

const paletteValues = new Set<string>(
  PROJECT_COLORS.map((color) => color.value),
)

/**
 * A colour from the project palette, stored in lower case. Only createLabel
 * checks it: labels written another way, such as the seed's until F58 (#81),
 * can hold colours outside the palette, so code that reads a label must not
 * assume its colour is in PROJECT_COLORS.
 */
export const labelColorSchema = z
  .string()
  .toLowerCase()
  .refine((value) => paletteValues.has(value), {
    error: 'Colour must be one of the project colours.',
  })

export const createLabelSchema = z.object({
  name: labelNameSchema,
  color: labelColorSchema,
})

/** A task's whole label set. Empty clears it. */
export const labelIdsSchema = z
  .array(labelIdSchema)
  .refine((ids) => new Set(ids).size === ids.length, {
    error: 'Each label may appear only once.',
  })

export type CreateLabelInput = z.input<typeof createLabelSchema>
