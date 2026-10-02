import * as z from 'zod'

import { taskIdFieldSchema } from '#/schemas/task'

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

/** The comment id as a tool argument, described for the model. */
export const commentIdFieldSchema = commentIdSchema.meta({
  description: 'The id of the comment, from list_comments.',
})

// The comment tools' inputs: the id the service takes as its first argument,
// beside the fields of the schema the service parses the rest with. Strict, so
// a misnamed field is a validation error rather than a change silently dropped.

/** The input of a tool that takes only a comment id. */
export const commentIdToolSchema = z.strictObject({
  commentId: commentIdFieldSchema,
})

/** The add_comment tool's input: the task id and createCommentSchema's fields. */
export const addCommentToolSchema = z.strictObject({
  taskId: taskIdFieldSchema,
  ...createCommentSchema.shape,
})

/** The update_comment tool's input: the comment id and updateCommentSchema's fields. */
export const updateCommentToolSchema = z.strictObject({
  commentId: commentIdFieldSchema,
  ...updateCommentSchema.shape,
})

export type AddCommentToolInput = z.input<typeof addCommentToolSchema>
export type UpdateCommentToolInput = z.input<typeof updateCommentToolSchema>

/** A comment as a tool returns it, after JSON: timestamps are ISO strings. */
export const commentOutputSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  body: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export type CommentOutput = z.infer<typeof commentOutputSchema>
