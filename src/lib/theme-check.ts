// The checks behind scripts/check-contrast.ts: reading the theme tokens out of
// src/styles.css, testing the listed pairs, and finding classes that render a
// theme colour at an opacity the check never saw. Kept apart from the script
// so Vitest can cover it. Runs under plain Node with type stripping, so it
// uses only erasable TypeScript syntax and relative `.ts` imports.
import {
  TEXT_MIN,
  UI_MIN,
  contrastRatio,
  isInSrgbGamut,
  oklchToSrgb,
  parseOklch,
} from './contrast.ts'
import type { Srgb } from './contrast.ts'

export type Pair = { fg: string; bg: string; kind: 'text' | 'ui' }

export type PairResult = Pair & {
  min: number
  /** Undefined when either token is missing or not a valid colour. */
  ratio: number | undefined
  pass: boolean
}

export type Themes = {
  light: Map<string, string>
  dark: Map<string, string>
  errors: Array<string>
}

type Block = { path: Array<string>; declarations: Map<string, string> }

/**
 * Lengths, numbers and calc() are not colours, so a theme token such as
 * --radius or --header-height is skipped. Anything else in :root or .dark is
 * read as a colour and must be oklch(L C H); fonts and other values belong in
 * @theme, not in the theme blocks.
 */
const NON_COLOR_VALUE =
  /^(?:[+-]?(?:\d+\.?\d*|\.\d+)(?:[a-z]+|%)?|calc\(.*\))$/i

const COLOR_VALUE =
  /^(?:#[\da-f]{3,8}\b|(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\()/i

export function isColorValue(value: string): boolean {
  return !NON_COLOR_VALUE.test(value.trim())
}

/**
 * Removes block comments, and line comments when `lineComments` is set (for
 * TypeScript, not CSS, where `//` appears in URLs). Quoted strings are kept
 * whole, so a comment marker inside a string is not treated as a comment. A
 * regular expression literal that contains a comment marker can still confuse
 * it; no file under src/ has one.
 */
export function stripComments(source: string, lineComments: boolean): string {
  let out = ''
  let i = 0
  while (i < source.length) {
    const ch = source[i]
    const next = source[i + 1]
    if (ch === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2)
      i = end === -1 ? source.length : end + 2
      out += ' '
    } else if (lineComments && ch === '/' && next === '/') {
      const end = source.indexOf('\n', i)
      i = end === -1 ? source.length : end
    } else if (ch === '"' || ch === "'" || ch === '`') {
      // An apostrophe in JSX text is not a string; ending single and double
      // quotes at the line end keeps that from swallowing the rest of a file.
      let j = i + 1
      while (j < source.length && source[j] !== ch) {
        if (source[j] === '\\') j++
        else if (ch !== '`' && source[j] === '\n') break
        j++
      }
      out += source.slice(i, j + 1)
      i = j + 1
    } else {
      out += ch
      i++
    }
  }
  return out
}

/** Every rule block in a comment-free stylesheet, with its own declarations. */
function readBlocks(css: string): Array<Block> {
  const blocks: Array<Block> = []
  const stack: Array<Block> = []
  let buffer = ''

  const declare = () => {
    const match = /^\s*--([\w-]+)\s*:\s*([^]*?)\s*$/.exec(buffer)
    if (match && stack.length > 0) {
      stack[stack.length - 1].declarations.set(match[1], match[2])
    }
    buffer = ''
  }

  for (const ch of css) {
    if (ch === '{') {
      const path = [...(stack.at(-1)?.path ?? []), buffer.trim()]
      const block = { path, declarations: new Map<string, string>() }
      blocks.push(block)
      stack.push(block)
      buffer = ''
    } else if (ch === '}') {
      declare()
      stack.pop()
    } else if (ch === ';') {
      declare()
    } else {
      buffer += ch
    }
  }
  return blocks
}

/**
 * Reads the light (:root) and dark (.dark) tokens from src/styles.css. Both
 * must be top-level rules. Any other rule, outside @theme, that sets a theme
 * token or a colour custom property is an error, so a token defined somewhere
 * the check does not read, such as :root inside @media, cannot skip it.
 */
export function readThemes(source: string): Themes {
  const blocks = readBlocks(stripComments(source, false))
  const light = new Map<string, string>()
  const dark = new Map<string, string>()
  const errors: Array<string> = []

  const others: Array<Block> = []
  for (const block of blocks) {
    const [first, ...rest] = block.path
    if (rest.length === 0 && first === ':root') {
      for (const [name, value] of block.declarations) light.set(name, value)
    } else if (rest.length === 0 && first === '.dark') {
      for (const [name, value] of block.declarations) dark.set(name, value)
    } else if (!first.startsWith('@theme')) {
      others.push(block)
    }
  }

  if (light.size === 0) errors.push('no top-level :root block with tokens')
  if (dark.size === 0) errors.push('no top-level .dark block with tokens')

  for (const { path, declarations } of others) {
    for (const [name, value] of declarations) {
      if (light.has(name) || dark.has(name) || COLOR_VALUE.test(value)) {
        errors.push(
          `${path.join(' > ')} sets --${name}; define colours only in the top-level :root and .dark blocks`,
        )
      }
    }
  }
  return { light, dark, errors }
}

/** The colour tokens of a theme, without lengths such as --radius. */
export function colorTokens(tokens: Map<string, string>): Array<string> {
  return [...tokens]
    .filter(([, value]) => isColorValue(value))
    .map(([name]) => name)
}

function resolveColors(tokens: Map<string, string>) {
  const colors = new Map<string, Srgb>()
  const errors: Array<string> = []
  for (const name of colorTokens(tokens)) {
    const value = tokens.get(name) ?? ''
    try {
      const oklch = parseOklch(value)
      if (isInSrgbGamut(oklch)) colors.set(name, oklchToSrgb(oklch))
      else errors.push(`--${name} ${value} is outside the sRGB gamut`)
    } catch (error) {
      errors.push(`--${name}: ${(error as Error).message}`)
    }
  }
  return { colors, errors }
}

/**
 * Computes every pair for one theme. A pair whose token is missing, or not a
 * valid in-gamut oklch colour, fails and adds an error naming the token.
 */
export function checkTheme(
  tokens: Map<string, string>,
  pairs: Array<Pair>,
): { results: Array<PairResult>; errors: Array<string> } {
  const { colors, errors } = resolveColors(tokens)
  const missing = new Set<string>()

  const results = pairs.map((pair): PairResult => {
    const min = pair.kind === 'text' ? TEXT_MIN : UI_MIN
    const fg = colors.get(pair.fg)
    const bg = colors.get(pair.bg)
    for (const name of [pair.fg, pair.bg]) {
      if (!tokens.has(name)) missing.add(name)
    }
    if (!fg || !bg) return { ...pair, min, ratio: undefined, pass: false }
    const ratio = contrastRatio(fg, bg)
    return { ...pair, min, ratio, pass: ratio >= min }
  })

  for (const name of missing) {
    errors.push(`--${name} is used in a pair but not defined`)
  }
  return { results, errors }
}

/**
 * Both themes must define the same colour tokens, and every colour token must
 * appear in at least one pair, so a new token cannot pass unchecked.
 */
export function checkTokenSets(
  light: Map<string, string>,
  dark: Map<string, string>,
  pairs: Array<Pair>,
): Array<string> {
  const errors: Array<string> = []
  const lightColors = new Set(colorTokens(light))
  const darkColors = new Set(colorTokens(dark))
  for (const [name, here, there] of [
    [':root', lightColors, darkColors],
    ['.dark', darkColors, lightColors],
  ] as const) {
    for (const token of here) {
      if (!there.has(token)) {
        errors.push(
          `--${token} is defined in ${name} but not in the other theme`,
        )
      }
    }
  }

  const paired = new Set(pairs.flatMap(({ fg, bg }) => [fg, bg]))
  for (const token of new Set([...lightColors, ...darkColors])) {
    if (!paired.has(token)) {
      errors.push(`--${token} is not checked by any pair`)
    }
  }
  return errors
}

/**
 * Finds utility classes that draw a theme colour with an opacity modifier,
 * such as ring-ring/50, bg-input/30 or dark:bg-destructive/60. The result is a
 * blend the contrast check never computed, so components must use the token
 * pairs at full opacity. `lineComments` is true for TypeScript sources.
 */
export function findTranslucentTokens(
  source: string,
  tokens: Iterable<string>,
  lineComments: boolean,
): Array<string> {
  const names = [...tokens]
    .sort((a, b) => b.length - a.length)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  if (names.length === 0) return []
  const pattern = new RegExp(
    String.raw`(?<![\w-])[a-z][\w-]*?-(?:${names.join('|')})\/[\w.%[\]()-]+`,
    'g',
  )
  const code = stripComments(source, lineComments)
  return [...code.matchAll(pattern)].map(([match]) => match)
}
