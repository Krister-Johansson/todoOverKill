import * as z from 'zod'

export const subtaskIdSchema = z.string().min(1)

export const subtaskTitleSchema = z
  .string()
  .trim()
  .min(1, { error: 'Title is required.' })
  .max(200, { error: 'Title must be 200 characters or fewer.' })

/**
 * Strict, as every subtask schema is, so a misspelled field is a 400 rather
 * than silently dropped.
 */
export const createSubtaskSchema = z.strictObject({
  title: subtaskTitleSchema,
})

/** Every field is optional, and `{}` changes nothing. */
export const updateSubtaskSchema = z
  .strictObject({
    title: subtaskTitleSchema,
    done: z.boolean({ error: 'Done must be true or false.' }),
  })
  .partial()

/**
 * The place among the task's other subtasks, so 0 is the top and an index
 * past the end means the end.
 */
export const moveSubtaskSchema = z.strictObject({
  index: z
    .int({ error: 'Index must be a whole number.' })
    .nonnegative({ error: 'Index must be 0 or more.' }),
})

export type CreateSubtaskInput = z.input<typeof createSubtaskSchema>
export type UpdateSubtaskInput = z.input<typeof updateSubtaskSchema>
export type MoveSubtaskInput = z.input<typeof moveSubtaskSchema>
