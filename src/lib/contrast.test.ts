// @vitest-environment node
// Pure maths, no DOM. scripts/check-contrast.ts depends on these results.
import { describe, expect, it } from 'vitest'

import {
  contrastRatio,
  isInSrgbGamut,
  oklchToSrgb,
  parseOklch,
  relativeLuminance,
} from '#/lib/contrast'

const white = { r: 1, g: 1, b: 1 }
const black = { r: 0, g: 0, b: 0 }

function ratio(fg: string, bg: string) {
  return contrastRatio(oklchToSrgb(parseOklch(fg)), oklchToSrgb(parseOklch(bg)))
}

describe('contrastRatio', () => {
  it('gives 21:1 for white on black, in either order', () => {
    expect(contrastRatio(white, black)).toBeCloseTo(21, 10)
    expect(contrastRatio(black, white)).toBeCloseTo(21, 10)
  })

  it('gives 1:1 for a colour on itself', () => {
    expect(contrastRatio(white, white)).toBe(1)
  })

  it('matches the WCAG luminance of a known sRGB grey', () => {
    // #767676 is the usual 4.54:1 grey on white.
    const grey = { r: 0x76 / 255, g: 0x76 / 255, b: 0x76 / 255 }
    expect(contrastRatio(grey, white)).toBeCloseTo(4.54, 2)
  })
})

describe('oklchToSrgb', () => {
  it('maps oklch white and black to sRGB white and black', () => {
    expect(ratio('oklch(1 0 0)', 'oklch(0 0 0)')).toBeCloseTo(21, 3)
  })

  it('maps L 0.5 grey to linear 0.125, which is 6:1 on white', () => {
    // An achromatic oklch colour has linear sRGB channels of L cubed.
    const grey = oklchToSrgb(parseOklch('oklch(0.5 0 0)'))
    expect(relativeLuminance(grey)).toBeCloseTo(0.125, 4)
    expect(ratio('oklch(0.5 0 0)', 'oklch(1 0 0)')).toBeCloseTo(6, 2)
  })

  it('reports out-of-gamut colours', () => {
    expect(isInSrgbGamut(parseOklch('oklch(0.45 0.2 262)'))).toBe(true)
    expect(isInSrgbGamut(parseOklch('oklch(0.9 0.4 145)'))).toBe(false)
  })
})

describe('parseOklch', () => {
  it('accepts lightness as a fraction or a percentage', () => {
    expect(parseOklch('oklch(0.5 0.1 200)')).toEqual({ l: 0.5, c: 0.1, h: 200 })
    expect(parseOklch('oklch(50% 0.1 200)')).toEqual({ l: 0.5, c: 0.1, h: 200 })
  })

  it('accepts a hue in deg', () => {
    expect(parseOklch(' oklch(0.5 0.1 200deg) ').h).toBe(200)
  })

  it('rejects alpha and other colour formats', () => {
    expect(() => parseOklch('oklch(0.5 0.1 200 / 50%)')).toThrow(/alpha/)
    expect(() => parseOklch('hsl(200 50% 50%)')).toThrow()
    expect(() => parseOklch('#ffffff')).toThrow()
    expect(() => parseOklch('oklch(1.5 0 0)')).toThrow(/range/)
  })
})
