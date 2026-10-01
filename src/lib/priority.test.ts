import { describe, expect, it } from 'vitest'

import { Priority } from '#/generated/prisma/enums'

import { PRIORITY_DISPLAY } from './priority'

describe('PRIORITY_DISPLAY', () => {
  it('covers every priority', () => {
    expect(Object.keys(PRIORITY_DISPLAY).sort()).toEqual(
      Object.values(Priority).sort(),
    )
  })

  it('gives each priority its own label', () => {
    const labels = Object.values(PRIORITY_DISPLAY).map(({ label }) => label)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('colours with the priority tokens', () => {
    for (const { className } of Object.values(PRIORITY_DISPLAY)) {
      expect(className).toMatch(/^text-priority-/)
    }
  })
})
