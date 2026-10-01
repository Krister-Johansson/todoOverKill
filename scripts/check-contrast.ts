// Checks the theme tokens in src/styles.css against docs/accessibility.md:
// 7:1 for text (1.4.6) and 3:1 for borders, inputs and the focus ring (1.4.11,
// 2.4.13), in the light (:root) and dark (.dark) themes. Runs in `pnpm lint`
// as plain Node with type stripping, so it uses only erasable syntax.
//
// It also fails when:
// - a pair names a token that is missing, or whose value is not oklch(L C H)
//   without alpha, or is outside the sRGB gamut (the browser would render a
//   different colour from the one checked);
// - :root and .dark define different tokens;
// - a colour token appears in no pair, so a new token cannot skip the check;
// - a file under src/ lowers the opacity of the ring colour (ring-ring/50),
//   which renders a colour this script never checked.
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import {
  TEXT_MIN,
  UI_MIN,
  contrastRatio,
  isInSrgbGamut,
  oklchToSrgb,
  parseOklch,
} from '../src/lib/contrast.ts'
import type { Srgb } from '../src/lib/contrast.ts'

type Kind = 'text' | 'ui'
type Pair = { fg: string; bg: string; kind: Kind }

/** Tokens in the theme blocks that are not colours. */
const NON_COLOR_TOKENS = new Set(['radius'])

/** Surfaces a priority or status accent can sit on, as an icon or a label. */
const ACCENT_SURFACES = [
  'background',
  'card',
  'popover',
  'muted',
  'accent',
  'sidebar',
  'sidebar-accent',
]

const ACCENTS = [
  'priority-none',
  'priority-low',
  'priority-medium',
  'priority-high',
  'priority-urgent',
  'status-backlog',
  'status-todo',
  'status-in-progress',
  'status-done',
]

/** Surfaces the focus ring can be drawn over or next to. */
const RING_SURFACES = [
  'background',
  'card',
  'popover',
  'muted',
  'accent',
  'primary',
  'sidebar',
  'sidebar-accent',
]

function text(fg: string, bg: string): Pair {
  return { fg, bg, kind: 'text' }
}

function ui(fg: string, bg: string): Pair {
  return { fg, bg, kind: 'ui' }
}

/** Every pair checked, in both themes. Foreground first, then background. */
const PAIRS: Array<Pair> = [
  // Body text on the page and on raised surfaces.
  text('foreground', 'background'),
  text('foreground', 'card'),
  text('foreground', 'popover'),
  text('foreground', 'muted'),
  text('card-foreground', 'card'),
  text('popover-foreground', 'popover'),
  // Secondary text, such as descriptions, placeholders and timestamps.
  text('muted-foreground', 'background'),
  text('muted-foreground', 'card'),
  text('muted-foreground', 'popover'),
  text('muted-foreground', 'muted'),
  text('muted-foreground', 'accent'),
  text('muted-foreground', 'sidebar'),
  // Text on filled buttons, badges and hovered rows.
  text('primary-foreground', 'primary'),
  text('secondary-foreground', 'secondary'),
  text('accent-foreground', 'accent'),
  text('destructive-foreground', 'destructive'),
  // Error text and destructive links on the page.
  text('destructive', 'background'),
  text('destructive', 'card'),
  text('destructive', 'popover'),
  // Sidebar navigation.
  text('sidebar-foreground', 'sidebar'),
  text('sidebar-primary-foreground', 'sidebar-primary'),
  text('sidebar-accent-foreground', 'sidebar-accent'),
  // Priority and status accents on every surface they appear on.
  ...ACCENTS.flatMap((accent) => ACCENT_SURFACES.map((bg) => text(accent, bg))),

  // Borders of inputs, cards and dividers.
  ui('border', 'background'),
  ui('border', 'card'),
  ui('border', 'popover'),
  ui('input', 'background'),
  ui('input', 'card'),
  ui('input', 'popover'),
  ui('sidebar-border', 'sidebar'),
  // Filled primary buttons against the page, so the button edge is visible.
  ui('primary', 'background'),
  ui('primary', 'card'),
  // The focus ring against everything it can be drawn over or next to.
  ...RING_SURFACES.map((bg) => ui('ring', bg)),
  ui('sidebar-ring', 'sidebar'),
  ui('sidebar-ring', 'sidebar-accent'),
  ui('sidebar-ring', 'sidebar-primary'),
]

/** Utility classes that draw the ring colour at reduced opacity. */
const TRANSLUCENT_RING = /\b(?:ring|outline)-(?:sidebar-)?ring\/[\w.[\]]+/g

const BLOCK_COMMENT = /\/\*[^]*?\*\//g

const root = fileURLToPath(new URL('..', import.meta.url))
const stylesPath = `${root}src/styles.css`

const errors: Array<string> = []

function readThemeBlock(css: string, selector: string): Map<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const blocks = [
    ...css.matchAll(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`, 'g')),
  ]
  const tokens = new Map<string, string>()
  if (blocks.length !== 1) {
    errors.push(
      `src/styles.css: expected one ${selector} block, found ${blocks.length}`,
    )
    return tokens
  }
  for (const declaration of blocks[0][1].split(';')) {
    const match = /^\s*--([\w-]+)\s*:\s*([^]*?)\s*$/.exec(declaration)
    if (match) tokens.set(match[1], match[2])
  }
  return tokens
}

function resolveColors(theme: string, tokens: Map<string, string>) {
  const colors = new Map<string, Srgb>()
  for (const [name, value] of tokens) {
    if (NON_COLOR_TOKENS.has(name)) continue
    try {
      const oklch = parseOklch(value)
      if (!isInSrgbGamut(oklch)) {
        errors.push(`${theme}: --${name} ${value} is outside the sRGB gamut`)
        continue
      }
      colors.set(name, oklchToSrgb(oklch))
    } catch (error) {
      errors.push(`${theme}: --${name}: ${(error as Error).message}`)
    }
  }
  return colors
}

function checkTheme(theme: string, tokens: Map<string, string>): number {
  const colors = resolveColors(theme, tokens)
  let failures = 0

  console.log(`\n${theme}`)
  console.log(
    `  ${'foreground'.padEnd(28)} ${'background'.padEnd(16)} ${'ratio'.padStart(6)}   min  result`,
  )
  for (const { fg, bg, kind } of PAIRS) {
    const fgColor = colors.get(fg)
    const bgColor = colors.get(bg)
    if (!fgColor || !bgColor) {
      for (const [name, color] of [
        [fg, fgColor],
        [bg, bgColor],
      ] as const) {
        if (!color && !tokens.has(name)) {
          errors.push(`${theme}: --${name} is used in PAIRS but not defined`)
        }
      }
      failures++
      continue
    }
    const min = kind === 'text' ? TEXT_MIN : UI_MIN
    const ratio = contrastRatio(fgColor, bgColor)
    const pass = ratio >= min
    if (!pass) failures++
    // Rounded down, so a 6.996 that fails is not printed as 7.00.
    const shown = (Math.floor(ratio * 100) / 100).toFixed(2)
    console.log(
      `  ${fg.padEnd(28)} ${bg.padEnd(16)} ${shown.padStart(6)}  ${String(min).padStart(3)}:1  ${pass ? 'pass' : 'FAIL'}`,
    )
  }
  return failures
}

function checkTokenSets(light: Map<string, string>, dark: Map<string, string>) {
  for (const [name, here, there] of [
    [':root', light, dark],
    ['.dark', dark, light],
  ] as const) {
    for (const token of here.keys()) {
      if (NON_COLOR_TOKENS.has(token) || there.has(token)) continue
      errors.push(`--${token} is defined in ${name} but not in the other theme`)
    }
  }

  const paired = new Set(PAIRS.flatMap(({ fg, bg }) => [fg, bg]))
  for (const token of new Set([...light.keys(), ...dark.keys()])) {
    if (NON_COLOR_TOKENS.has(token) || paired.has(token)) continue
    errors.push(`--${token} is not checked by any pair in PAIRS`)
  }
}

function checkRingOpacity() {
  const srcDir = `${root}src/`
  const files = readdirSync(srcDir, { recursive: true, encoding: 'utf8' })
  for (const file of files) {
    if (!/\.(?:tsx?|css)$/.test(file) || file.startsWith('generated')) continue
    // Block comments may name the forbidden classes, as src/styles.css does.
    const source = readFileSync(srcDir + file, 'utf8').replace(
      BLOCK_COMMENT,
      '',
    )
    for (const [match] of source.matchAll(TRANSLUCENT_RING)) {
      errors.push(
        `src/${file}: ${match} lowers the ring opacity; use the full colour`,
      )
    }
  }
}

const css = readFileSync(stylesPath, 'utf8').replace(BLOCK_COMMENT, '')
const light = readThemeBlock(css, ':root')
const dark = readThemeBlock(css, '.dark')

checkTokenSets(light, dark)
checkRingOpacity()
const failures =
  checkTheme('light (:root)', light) + checkTheme('dark (.dark)', dark)

for (const error of errors) console.error(`error: ${error}`)
if (failures > 0 || errors.length > 0) {
  console.error(
    `\nContrast check failed: ${failures} pair(s) below the minimum, ${errors.length} other error(s).`,
  )
  process.exitCode = 1
} else {
  console.log(`\nContrast check passed: ${PAIRS.length} pairs in each theme.`)
}
