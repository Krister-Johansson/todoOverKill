import { describe, expect, it } from 'vitest'

import { searchSchema } from '#/schemas/search'

describe('searchSchema', () => {
  it('trims the query and defaults the limit to 10', () => {
    expect(searchSchema.parse({ query: '  web \n' })).toEqual({
      query: 'web',
      limit: 10,
    })
  })

  it.each(['', '   ', 'x'.repeat(201)])('rejects the query %j', (query) => {
    expect(searchSchema.safeParse({ query }).success).toBe(false)
  })

  it('accepts a 200 character query', () => {
    const query = 'x'.repeat(200)
    expect(searchSchema.parse({ query }).query).toBe(query)
  })

  it('says a blank query is required', () => {
    const result = searchSchema.safeParse({ query: ' ' })
    expect(result.error?.issues[0].message).toBe('Search text is required.')
  })

  it('says how long a query may be', () => {
    const result = searchSchema.safeParse({ query: 'x'.repeat(201) })
    expect(result.error?.issues[0].message).toBe(
      'Search text must be 200 characters or fewer.',
    )
  })

  it.each([1, 50])('accepts the limit %d', (limit) => {
    expect(searchSchema.parse({ query: 'web', limit }).limit).toBe(limit)
  })

  it.each([0, 51, 2.5, -1])('rejects the limit %d', (limit) => {
    expect(searchSchema.safeParse({ query: 'web', limit }).success).toBe(false)
  })

  it('requires a query', () => {
    expect(searchSchema.safeParse({}).success).toBe(false)
  })

  it('rejects an unknown key', () => {
    const result = searchSchema.safeParse({ query: 'web', kind: 'task' })
    expect(result.error?.issues[0].code).toBe('unrecognized_keys')
  })
})
