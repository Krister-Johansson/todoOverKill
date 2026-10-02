// @vitest-environment node
// Server code runs without `window`. Under jsdom, t3-env treats the module as
// client code and blocks every server variable.
import { describe, expect, it } from 'vitest'

import { SEARCH_QUERY_KEY, searchQueryOptions } from '#/fns/search'
import { MAX_SEARCH_LENGTH, searchSchema } from '#/schemas/search'

describe('searchQueryOptions', () => {
  it('keys the query by the trimmed text', () => {
    expect(searchQueryOptions('  tok-1 ').queryKey).toEqual([
      ...SEARCH_QUERY_KEY,
      'tok-1',
    ])
    expect(searchQueryOptions('web').queryKey).not.toEqual(
      searchQueryOptions('webs').queryKey,
    )
  })

  it('treats a cached answer as stale at once', () => {
    expect(searchQueryOptions('web').staleTime).toBe(0)
  })
})

describe('searchFn input', () => {
  it.each([
    ['a blank query', '   '],
    ['a query one character too long', 'x'.repeat(MAX_SEARCH_LENGTH + 1)],
  ])('rejects %s before any request', (_, query) => {
    expect(searchSchema.safeParse({ query }).success).toBe(false)
  })

  it('accepts a query with no limit', () => {
    expect(searchSchema.parse({ query: ' web ' })).toEqual({
      query: 'web',
      limit: 10,
    })
  })
})
