// WCAG 2.x contrast for the oklch() colours in src/styles.css. Used by
// scripts/check-contrast.ts, which runs under plain Node with type stripping,
// so this file has no imports and uses only erasable TypeScript syntax.

/** Minimum contrast for text (1.4.6, AAA). */
export const TEXT_MIN = 7

/** Minimum contrast for UI components and focus rings (1.4.11). */
export const UI_MIN = 3

export type Oklch = { l: number; c: number; h: number }

/** Gamma-encoded sRGB channels, each 0 to 1. */
export type Srgb = { r: number; g: number; b: number }

const NUMBER = String.raw`[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?`
const OKLCH = new RegExp(
  String.raw`^oklch\(\s*(${NUMBER})(%?)\s+(${NUMBER})\s+(${NUMBER})(deg)?\s*\)$`,
  'i',
)

/**
 * Parses `oklch(L C H)` with L as 0-1 or a percentage and H in degrees.
 * Throws on anything else, including an alpha channel: a translucent colour
 * has no fixed contrast, so the theme must not use one for a checked token.
 */
export function parseOklch(value: string): Oklch {
  const match = OKLCH.exec(value.trim())
  if (!match) {
    throw new Error(
      `Expected oklch(L C H) without alpha, got ${JSON.stringify(value)}`,
    )
  }
  const [, l, percent, c, h] = match
  const lightness = percent ? Number(l) / 100 : Number(l)
  if (lightness < 0 || lightness > 1 || Number(c) < 0) {
    throw new Error(`oklch value out of range: ${JSON.stringify(value)}`)
  }
  return { l: lightness, c: Number(c), h: Number(h) }
}

/** Linear-light sRGB, not clamped, so callers can tell out-of-gamut colours. */
export function oklchToLinearSrgb({ l, c, h }: Oklch): Srgb {
  const hue = (h * Math.PI) / 180
  const a = c * Math.cos(hue)
  const b = c * Math.sin(hue)

  // OKLab to LMS to linear sRGB, matrices from Björn Ottosson's reference.
  const lms = [
    l + 0.3963377774 * a + 0.2158037573 * b,
    l - 0.1055613458 * a - 0.0638541728 * b,
    l - 0.0894841775 * a - 1.291485548 * b,
  ].map((x) => x ** 3)

  return {
    r: 4.0767416621 * lms[0] - 3.3077115913 * lms[1] + 0.2309699292 * lms[2],
    g: -1.2684380046 * lms[0] + 2.6097574011 * lms[1] - 0.3413193965 * lms[2],
    b: -0.0041960863 * lms[0] - 0.7034186147 * lms[1] + 1.707614701 * lms[2],
  }
}

/** True when the colour fits in sRGB, so the browser renders it unchanged. */
export function isInSrgbGamut(color: Oklch, tolerance = 1e-4): boolean {
  const { r, g, b } = oklchToLinearSrgb(color)
  return [r, g, b].every((x) => x >= -tolerance && x <= 1 + tolerance)
}

function encode(linear: number): number {
  const x = Math.min(1, Math.max(0, linear))
  return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055
}

/** Gamma-encoded sRGB, each channel clamped to 0-1. */
export function oklchToSrgb(color: Oklch): Srgb {
  const { r, g, b } = oklchToLinearSrgb(color)
  return { r: encode(r), g: encode(g), b: encode(b) }
}

function decode(channel: number): number {
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4
}

/** WCAG 2.x relative luminance of a gamma-encoded sRGB colour. */
export function relativeLuminance({ r, g, b }: Srgb): number {
  return 0.2126 * decode(r) + 0.7152 * decode(g) + 0.0722 * decode(b)
}

/** WCAG 2.x contrast ratio, from 1 to 21. The order of the colours does not matter. */
export function contrastRatio(a: Srgb, b: Srgb): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x,
  )
  return (light + 0.05) / (dark + 0.05)
}
