import * as z from 'zod'

export const commentIdSchema = z.string().min(1)

export const commentBodySchema = z
  .string()
  .trim()
  .min(1, { error: 'Comment is required.' })
  .max(10_000, { error: 'Comment must be 10000 characters or fewer.' })

/**
 * Strict, as every comment schema is, so a misspelled field is a 400 rather
 * than silently dropped.
 */
export const createCommentSchema = z.strictObject({
  body: commentBodySchema,
})

/** The body is the only field, so an update must give it. */
export const updateCommentSchema = z.strictObject({
  body: commentBodySchema,
})

export type CreateCommentInput = z.input<typeof createCommentSchema>
export type UpdateCommentInput = z.input<typeof updateCommentSchema>
