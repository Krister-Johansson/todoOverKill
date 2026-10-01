// Checks the theme tokens in src/styles.css against docs/accessibility.md:
// 7:1 for text (1.4.6) and 3:1 for borders, inputs and the focus ring (1.4.11,
// 2.4.13), in the light (:root) and dark (.dark) themes. Runs in `pnpm lint`
// as plain Node with type stripping, so it uses only erasable syntax.
//
// It also fails when:
// - a pair names a token that is missing, or whose value is not oklch(L C H)
//   without alpha, or is outside the sRGB gamut (the browser would render a
//   different colour from the one checked);
// - :root and .dark define different colour tokens;
// - a colour token appears in no pair, so a new token cannot skip the check;
// - a rule other than the top-level :root and .dark sets a theme token or a
//   colour custom property, such as :root inside @media;
// - a file under src/ draws a theme colour with an opacity modifier, such as
//   ring-ring/50 or bg-input/30, which renders a colour this script never saw.
//
// The parsing and checks live in src/lib/theme-check.ts, which has unit tests.
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import {
  checkTheme,
  checkTokenSets,
  colorTokens,
  findTranslucentTokens,
  readThemes,
} from '../src/lib/theme-check.ts'
import type { Pair } from '../src/lib/theme-check.ts'

/**
 * Surfaces that text can sit on: the page, raised surfaces, hovered and
 * selected rows, and the sidebar.
 */
const TEXT_SURFACES = [
  'background',
  'card',
  'popover',
  'muted',
  'secondary',
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

/**
 * Surfaces the focus ring can be drawn over or next to, including filled
 * buttons: 2.4.13 asks for 3:1 against the element and its background.
 */
const RING_SURFACES = [
  ...TEXT_SURFACES,
  'primary',
  'destructive',
  'sidebar-primary',
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
  ...TEXT_SURFACES.map((bg) => text('foreground', bg)),
  text('card-foreground', 'card'),
  text('popover-foreground', 'popover'),
  // Secondary text, such as descriptions, placeholders and timestamps.
  ...TEXT_SURFACES.map((bg) => text('muted-foreground', bg)),
  // Text on filled buttons, badges and hovered rows.
  text('primary-foreground', 'primary'),
  text('secondary-foreground', 'secondary'),
  text('accent-foreground', 'accent'),
  text('destructive-foreground', 'destructive'),
  // Error text and destructive links, wherever text can sit.
  ...TEXT_SURFACES.map((bg) => text('destructive', bg)),
  // Sidebar navigation.
  text('sidebar-foreground', 'sidebar'),
  text('sidebar-foreground', 'sidebar-accent'),
  text('sidebar-primary-foreground', 'sidebar-primary'),
  text('sidebar-accent-foreground', 'sidebar-accent'),
  // Priority and status accents, as an icon or a label, on every surface.
  ...ACCENTS.flatMap((accent) => TEXT_SURFACES.map((bg) => text(accent, bg))),

  // Borders of inputs, cards and dividers, on every surface they can sit on.
  ...TEXT_SURFACES.map((bg) => ui('border', bg)),
  ...TEXT_SURFACES.map((bg) => ui('input', bg)),
  ui('sidebar-border', 'sidebar'),
  ui('sidebar-border', 'sidebar-accent'),
  // Filled primary buttons against the page, so the button edge is visible.
  ui('primary', 'background'),
  ui('primary', 'card'),
  // The switch thumb on the unchecked and checked track.
  ui('background', 'input'),
  ui('background', 'primary'),
  // The focus ring against everything it can be drawn over or next to.
  ...RING_SURFACES.map((bg) => ui('ring', bg)),
  ui('sidebar-ring', 'sidebar'),
  ui('sidebar-ring', 'sidebar-accent'),
  ui('sidebar-ring', 'sidebar-primary'),
]

const root = fileURLToPath(new URL('..', import.meta.url))
const srcDir = `${root}src/`

function printTheme(theme: string, tokens: Map<string, string>) {
  const { results, errors } = checkTheme(tokens, PAIRS)
  console.log(`\n${theme}`)
  console.log(
    `  ${'foreground'.padEnd(28)} ${'background'.padEnd(16)} ${'ratio'.padStart(6)}   min  result`,
  )
  for (const { fg, bg, min, ratio, pass } of results) {
    // Rounded down, so a 6.996 that fails is not printed as 7.00.
    const shown =
      ratio === undefined ? '-' : (Math.floor(ratio * 100) / 100).toFixed(2)
    console.log(
      `  ${fg.padEnd(28)} ${bg.padEnd(16)} ${shown.padStart(6)}  ${String(min).padStart(3)}:1  ${pass ? 'pass' : 'FAIL'}`,
    )
  }
  return {
    failures: results.filter(({ pass }) => !pass).length,
    errors: errors.map((error) => `${theme}: ${error}`),
  }
}

function checkSources(tokens: Array<string>): Array<string> {
  const errors: Array<string> = []
  const files = readdirSync(srcDir, { recursive: true, encoding: 'utf8' })
  for (const file of files) {
    // Tests are not rendered, and theme-check.test.ts names the classes.
    if (!/\.(?:tsx?|css)$/.test(file) || /\.test\.tsx?$/.test(file)) continue
    if (file.startsWith('generated')) continue
    const source = readFileSync(srcDir + file, 'utf8')
    for (const match of findTranslucentTokens(
      source,
      tokens,
      !file.endsWith('.css'),
    )) {
      errors.push(
        `src/${file}: ${match} draws a theme colour at reduced opacity; use the full token`,
      )
    }
  }
  return errors
}

const themes = readThemes(readFileSync(`${srcDir}styles.css`, 'utf8'))
const light = printTheme('light (:root)', themes.light)
const dark = printTheme('dark (.dark)', themes.dark)
const tokens = new Set([
  ...colorTokens(themes.light),
  ...colorTokens(themes.dark),
])

const failures = light.failures + dark.failures
const errors = [
  ...themes.errors.map((error) => `src/styles.css: ${error}`),
  ...checkTokenSets(themes.light, themes.dark, PAIRS),
  ...light.errors,
  ...dark.errors,
  ...checkSources([...tokens]),
]

for (const error of errors) console.error(`error: ${error}`)
if (failures > 0 || errors.length > 0) {
  console.error(
    `\nContrast check failed: ${failures} pair(s) below the minimum, ${errors.length} other error(s).`,
  )
  process.exitCode = 1
} else {
  console.log(`\nContrast check passed: ${PAIRS.length} pairs in each theme.`)
}
