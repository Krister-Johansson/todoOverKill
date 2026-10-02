import * as z from 'zod'

/**
 * Strict, as the other schemas are, so a misspelled option is a ZodError
 * rather than silently dropped. The limit applies to each kind on its own.
 */
export const searchSchema = z.strictObject({
  query: z
    .string()
    .trim()
    .min(1, { error: 'Search text is required.' })
    .max(200, { error: 'Search text must be 200 characters or fewer.' }),
  limit: z
    .int()
    .min(1, { error: 'Limit must be at least 1.' })
    .max(50, { error: 'Limit must be 50 or fewer.' })
    .default(10),
})

export type SearchInput = z.input<typeof searchSchema>
export type SearchOptions = Pick<SearchInput, 'limit'>
