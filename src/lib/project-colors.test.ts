// @vitest-environment node
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { UI_MIN, contrastRatio, oklchToSrgb, parseOklch } from '#/lib/contrast'
import {
  CHIP_HOVER_SURFACES,
  CHIP_SURFACES,
  PROJECT_COLORS,
  projectColorName,
} from '#/lib/project-colors'
import { readThemes } from '#/lib/theme-check'
import { createProjectSchema } from '#/schemas/project'

const themes = readThemes(readFileSync('src/styles.css', 'utf8'))

function hexToSrgb(hex: string) {
  const channel = (start: number) =>
    Number.parseInt(hex.slice(start, start + 2), 16) / 255
  return { r: channel(1), g: channel(3), b: channel(5) }
}

// Dark --accent is lighter than dark --background, so these palette colours
// drop below 3:1 on a hovered card (Blue 2.88, Green 2.97, Amber 2.97,
// Teal 2.72). Recorded here until the fix for #81 is decided.
const HOVER_SHORTFALL = {
  light: [],
  dark: ['Blue', 'Green', 'Amber', 'Teal'],
} satisfies Record<'light' | 'dark', string[]>

describe('PROJECT_COLORS', () => {
  it('has unique names and values the project schema accepts', () => {
    expect(new Set(PROJECT_COLORS.map((c) => c.name)).size).toBe(
      PROJECT_COLORS.length,
    )
    for (const { value } of PROJECT_COLORS) {
      expect(createProjectSchema.shape.color.safeParse(value).success).toBe(
        true,
      )
    }
  })

  it('names chip surfaces that exist in both themes', () => {
    for (const theme of ['light', 'dark'] as const) {
      for (const surface of [...CHIP_SURFACES, ...CHIP_HOVER_SURFACES]) {
        expect(themes[theme].has(surface), `${theme} --${surface}`).toBe(true)
      }
    }
  })

  for (const theme of ['light', 'dark'] as const) {
    for (const surface of CHIP_SURFACES) {
      it(`reaches 3:1 against --${surface} in the ${theme} theme`, () => {
        const token = themes[theme].get(surface)
        if (!token) throw new Error(`--${surface} is missing`)
        const bg = oklchToSrgb(parseOklch(token))
        for (const { name, value } of PROJECT_COLORS) {
          const ratio = contrastRatio(hexToSrgb(value), bg)
          expect(ratio, `${name} ${value}`).toBeGreaterThanOrEqual(UI_MIN)
        }
      })
    }

    for (const surface of CHIP_HOVER_SURFACES) {
      it(`lists the palette colours below 3:1 against --${surface} in the ${theme} theme`, () => {
        const token = themes[theme].get(surface)
        if (!token) throw new Error(`--${surface} is missing`)
        const bg = oklchToSrgb(parseOklch(token))
        const below = PROJECT_COLORS.filter(
          ({ value }) => contrastRatio(hexToSrgb(value), bg) < UI_MIN,
        ).map(({ name }) => name)
        expect(below).toEqual(HOVER_SHORTFALL[theme])
      })
    }
  }
})

describe('projectColorName', () => {
  it('names a palette colour in any case', () => {
    expect(projectColorName('#2563EB')).toBe('Blue')
  })

  it('returns undefined for no colour or a colour outside the palette', () => {
    expect(projectColorName(null)).toBeUndefined()
    expect(projectColorName('#123456')).toBeUndefined()
  })
})
