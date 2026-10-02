// @vitest-environment node
// Server code runs without `window`. Under jsdom, t3-env treats the module as
// client code and blocks every server variable.
import { describe, expect, it } from 'vitest'

import { SEARCH_QUERY_KEY, searchQueryOptions } from '#/fns/search'
import { searchSchema } from '#/schemas/search'

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
})

describe('searchFn input', () => {
  it.each([
    ['a blank query', '   '],
    ['a 201 character query', 'x'.repeat(201)],
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
