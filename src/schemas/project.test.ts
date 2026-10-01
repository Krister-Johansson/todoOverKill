import { describe, expect, it } from 'vitest'

import {
  createProjectSchema,
  listProjectsSchema,
  projectKeySchema,
  updateProjectSchema,
} from '#/schemas/project'

describe('projectKeySchema', () => {
  it('trims and upper-cases the key', () => {
    expect(projectKeySchema.parse('  tok ')).toBe('TOK')
    expect(projectKeySchema.parse('web2')).toBe('WEB2')
  })

  it.each(['', 'T', '1TOK', 'TO-K', 'TOO LONG', 'ABCDEFGHIJK'])(
    'rejects %j',
    (key) => {
      expect(projectKeySchema.safeParse(key).success).toBe(false)
    },
  )

  it('explains the rule in the error', () => {
    const result = projectKeySchema.safeParse('a')
    expect(result.error?.issues[0].message).toMatch(/2 to 10 letters or digits/)
  })
})

describe('createProjectSchema', () => {
  it('trims the name and normalises the key', () => {
    expect(createProjectSchema.parse({ name: '  Web  ', key: 'web' })).toEqual({
      name: 'Web',
      key: 'WEB',
    })
  })

  it('rejects an empty or blank name', () => {
    expect(
      createProjectSchema.safeParse({ name: '', key: 'WEB' }).success,
    ).toBe(false)
    expect(
      createProjectSchema.safeParse({ name: '   ', key: 'WEB' }).success,
    ).toBe(false)
  })

  it('rejects a name over 100 characters', () => {
    const name = 'a'.repeat(101)
    expect(createProjectSchema.safeParse({ name, key: 'WEB' }).success).toBe(
      false,
    )
  })

  it('accepts a hex colour and rejects a colour name', () => {
    const base = { name: 'Web', key: 'WEB' }
    expect(
      createProjectSchema.safeParse({ ...base, color: '#1d4ed8' }).success,
    ).toBe(true)
    expect(
      createProjectSchema.safeParse({ ...base, color: 'blue' }).success,
    ).toBe(false)
    expect(
      createProjectSchema.safeParse({ ...base, color: '#fff' }).success,
    ).toBe(false)
  })

  it('accepts null for the description and colour', () => {
    expect(
      createProjectSchema.parse({
        name: 'Web',
        key: 'WEB',
        description: null,
        color: null,
      }),
    ).toEqual({ name: 'Web', key: 'WEB', description: null, color: null })
  })
})

describe('updateProjectSchema', () => {
  it('accepts a single field', () => {
    expect(updateProjectSchema.parse({ color: '#0f766e' })).toEqual({
      color: '#0f766e',
    })
  })

  it('accepts an empty patch', () => {
    expect(updateProjectSchema.parse({})).toEqual({})
  })

  it('still normalises and checks the key', () => {
    expect(updateProjectSchema.parse({ key: ' new ' })).toEqual({ key: 'NEW' })
    expect(updateProjectSchema.safeParse({ key: 'n' }).success).toBe(false)
  })
})

describe('listProjectsSchema', () => {
  it('defaults includeArchived to false', () => {
    expect(listProjectsSchema.parse({})).toEqual({ includeArchived: false })
  })
})
