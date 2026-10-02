import * as z from 'zod'

import { statusOutputSchema } from '#/schemas/status'

/** Short code such as "TOK" that prefixes task references (TOK-42). */
export const projectKeySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z][A-Z0-9]{1,9}$/, {
    error:
      'Key must be 2 to 10 letters or digits and start with a letter, such as TOK.',
  })

const nameSchema = z
  .string()
  .trim()
  .min(1, { error: 'Name is required.' })
  .max(100, { error: 'Name must be 100 characters or fewer.' })

const descriptionSchema = z
  .string()
  .trim()
  .max(2000, { error: 'Description must be 2000 characters or fewer.' })

const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, {
  error: 'Colour must be a hex value such as #1d4ed8.',
})

export const projectIdSchema = z.string().min(1)

/** The project id as a tool argument, described for the model. */
export const projectIdFieldSchema = projectIdSchema.meta({
  description: 'The id of the project, from list_projects or search.',
})

/** The input of a tool that takes only a project id. */
export const projectIdToolSchema = z.strictObject({
  projectId: projectIdFieldSchema,
})

export const createProjectSchema = z.object({
  name: nameSchema,
  key: projectKeySchema,
  description: descriptionSchema.nullish(),
  color: colorSchema.nullish(),
})

/** Every field is optional. `null` clears the description or colour. */
export const updateProjectSchema = createProjectSchema.partial()

export const listProjectsSchema = z.object({
  includeArchived: z.boolean().default(false),
})

/**
 * The query string of GET /api/v1/projects. Query values are strings, so
 * includeArchived accepts "true" or "false" (and 1/0, yes/no, on/off).
 */
export const listProjectsQuerySchema = z.object({
  includeArchived: z.stringbool().default(false),
})

// Input types, because the services parse what they are given. For create and
// update they equal the parsed types; for list, includeArchived is optional.
export type CreateProjectInput = z.input<typeof createProjectSchema>
export type UpdateProjectInput = z.input<typeof updateProjectSchema>
export type ListProjectsInput = z.input<typeof listProjectsSchema>

/** A project as a tool returns it, after JSON: timestamps are ISO strings. */
export const projectOutputSchema = z.object({
  id: z.string(),
  name: z.string(),
  key: z.string(),
  description: z.string().nullable(),
  color: z.string().nullable(),
  nextTaskNumber: z.int(),
  archivedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

/** getProject's shape: the project with its statuses in board order. */
export const projectWithStatusesOutputSchema = projectOutputSchema.extend({
  statuses: z.array(statusOutputSchema),
})

export type ProjectOutput = z.infer<typeof projectOutputSchema>
export type ProjectWithStatusesOutput = z.infer<
  typeof projectWithStatusesOutputSchema
>
