import { queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'

import { getAssistantStatus } from '#/server/assistant'

/** Whether OPENROUTER_API_KEY is set, and the model name. Never the key. */
export const getAssistantStatusFn = createServerFn({ method: 'GET' }).handler(
  () => getAssistantStatus(),
)

/**
 * The assistant panel's status. The _app loader fills it on the server. The
 * key is read once at startup, so the value never goes stale.
 */
export function assistantStatusQueryOptions() {
  return queryOptions({
    queryKey: ['assistant', 'status'],
    queryFn: () => getAssistantStatusFn(),
    staleTime: Infinity,
  })
}
