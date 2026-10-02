import * as z from 'zod'

import { taskIdFieldSchema } from '#/schemas/task'

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

/** The subtask id as a tool argument, described for the model. */
export const subtaskIdFieldSchema = subtaskIdSchema.meta({
  description: 'The id of the subtask, from list_subtasks.',
})

// The subtask tools' inputs: the id the service takes as its first argument,
// beside the fields of the schema the service parses the rest with. Strict, so
// a misnamed field is a validation error rather than a change silently dropped.

/** The input of a tool that takes only a subtask id. */
export const subtaskIdToolSchema = z.strictObject({
  subtaskId: subtaskIdFieldSchema,
})

/** The add_subtask tool's input: the task id and createSubtaskSchema's fields. */
export const addSubtaskToolSchema = z.strictObject({
  taskId: taskIdFieldSchema,
  ...createSubtaskSchema.shape,
})

/** The update_subtask tool's input: the subtask id and updateSubtaskSchema's fields. */
export const updateSubtaskToolSchema = z.strictObject({
  subtaskId: subtaskIdFieldSchema,
  ...updateSubtaskSchema.shape,
})

/** The move_subtask tool's input: the subtask id and moveSubtaskSchema's fields. */
export const moveSubtaskToolSchema = z.strictObject({
  subtaskId: subtaskIdFieldSchema,
  ...moveSubtaskSchema.shape,
})

export type AddSubtaskToolInput = z.input<typeof addSubtaskToolSchema>
export type UpdateSubtaskToolInput = z.input<typeof updateSubtaskToolSchema>
export type MoveSubtaskToolInput = z.input<typeof moveSubtaskToolSchema>

/** A subtask as a tool returns it. */
export const subtaskOutputSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  title: z.string(),
  done: z.boolean(),
  order: z.number(),
})

export type SubtaskOutput = z.infer<typeof subtaskOutputSchema>
