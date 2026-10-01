import { describe, expect, it } from 'vitest'

import { suggestProjectKey } from '#/lib/project-key'
import { projectKeySchema } from '#/schemas/project'

describe('suggestProjectKey', () => {
  it('uses the initials of a name with several words', () => {
    expect(suggestProjectKey('todo Over Kill')).toBe('TOK')
    expect(suggestProjectKey('home-office move')).toBe('HOM')
  })

  it('uses the first three characters of a single word', () => {
    expect(suggestProjectKey('Website')).toBe('WEB')
    expect(suggestProjectKey('Q4')).toBe('Q4')
  })

  it('keeps only letters and digits, in upper case', () => {
    expect(suggestProjectKey('  café & crème ')).toBe('CC')
    expect(suggestProjectKey('R&D')).toBe('RD')
  })

  it('starts with a letter', () => {
    expect(suggestProjectKey('2026 Launch Plan')).toBe('LP')
    expect(suggestProjectKey('3D printing')).toBe('DPR')
  })

  it('stops at ten characters', () => {
    expect(suggestProjectKey('a b c d e f g h i j k l')).toBe('ABCDEFGHIJ')
  })

  it('returns an empty string when no valid key can be made', () => {
    expect(suggestProjectKey('')).toBe('')
    expect(suggestProjectKey('   ')).toBe('')
    expect(suggestProjectKey('!!!')).toBe('')
    expect(suggestProjectKey('A')).toBe('')
    expect(suggestProjectKey('2026')).toBe('')
    expect(suggestProjectKey('42 A')).toBe('')
  })

  it('suggests only keys the schema accepts', () => {
    for (const name of ['todo Over Kill', 'Website', 'R&D', '2026 Launch']) {
      expect(projectKeySchema.safeParse(suggestProjectKey(name)).success).toBe(
        true,
      )
    }
  })
})
