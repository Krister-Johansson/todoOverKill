import * as z from 'zod'

/** The longest search text the schema takes, after trimming. */
export const MAX_SEARCH_LENGTH = 200

/**
 * Strict, as the other schemas are, so a misspelled option is a ZodError
 * rather than silently dropped. The limit applies to each kind on its own.
 */
export const searchSchema = z.strictObject({
  query: z
    .string()
    .trim()
    .min(1, { error: 'Search text is required.' })
    .max(MAX_SEARCH_LENGTH, {
      error: `Search text must be ${MAX_SEARCH_LENGTH} characters or fewer.`,
    }),
  limit: z
    .int()
    .min(1, { error: 'Limit must be at least 1.' })
    .max(50, { error: 'Limit must be 50 or fewer.' })
    .default(10),
})

export type SearchInput = z.input<typeof searchSchema>
export type SearchOptions = Pick<SearchInput, 'limit'>

/** search's result as a tool returns it. */
export const searchResultsOutputSchema = z.object({
  projects: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      key: z.string(),
      color: z.string().nullable(),
    }),
  ),
  tasks: z.array(
    z.object({
      id: z.string(),
      number: z.int(),
      title: z.string(),
      project: z.object({ key: z.string(), name: z.string() }),
      status: z.object({ name: z.string() }),
    }),
  ),
})

export type SearchResultsOutput = z.infer<typeof searchResultsOutputSchema>
