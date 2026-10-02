import { queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'

import { searchSchema } from '#/schemas/search'
import { search } from '#/server/search'

/** The palette searches from this many characters of trimmed text on. */
export const MIN_SEARCH_LENGTH = 2

/** The longest text searchSchema takes; longer text is not searched. */
export const MAX_SEARCH_LENGTH = 200

export const SEARCH_QUERY_KEY = ['search'] as const

/** Matching projects and tasks, as the F25 service returns them. */
export const searchFn = createServerFn({ method: 'GET' })
  .inputValidator(searchSchema)
  .handler(({ data }) => search(data.query, { limit: data.limit }))

/**
 * Keyed by the trimmed text, so a response is cached under the text it
 * answers and a slow one for older text never shows as the newer text's
 * results. Retyping the same text within the stale time reuses the entry.
 */
export function searchQueryOptions(text: string) {
  const query = text.trim()
  return queryOptions({
    queryKey: [...SEARCH_QUERY_KEY, query],
    queryFn: () => searchFn({ data: { query } }),
    staleTime: 30_000,
  })
}
