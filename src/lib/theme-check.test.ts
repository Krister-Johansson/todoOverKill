// @vitest-environment node
// The parsing and checks behind scripts/check-contrast.ts. A regression here
// would let `pnpm lint` pass without checking anything.
import { describe, expect, it } from 'vitest'

import {
  checkTheme,
  checkTokenSets,
  colorTokens,
  findTranslucentTokens,
  isColorValue,
  readThemes,
  stripComments,
} from '#/lib/theme-check'
import type { Pair } from '#/lib/theme-check'

const CSS = `
@import 'tailwindcss';
/* :root { --background: oklch(0 0 0); } in a comment is ignored */
:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0 0 0);
  --radius: 0.625rem;
}
.dark {
  --background: oklch(0 0 0);
  --foreground: oklch(1 0 0)
}
@theme inline {
  --color-background: var(--background);
  --radius-sm: calc(var(--radius) - 4px);
}
@layer base {
  * { @apply border-border; }
}
`

describe('readThemes', () => {
  it('reads the top-level :root and .dark blocks and skips comments', () => {
    const { light, dark, errors } = readThemes(CSS)
    expect(errors).toEqual([])
    expect(Object.fromEntries(light)).toEqual({
      background: 'oklch(1 0 0)',
      foreground: 'oklch(0 0 0)',
      radius: '0.625rem',
    })
    expect(Object.fromEntries(dark)).toEqual({
      background: 'oklch(0 0 0)',
      foreground: 'oklch(1 0 0)',
    })
  })

  it('fails when a theme token is set in another block', () => {
    const css = `${CSS}
@media (prefers-color-scheme: dark) {
  :root:not(.light) { --background: oklch(0.1 0 0); }
}`
    expect(readThemes(css).errors).toEqual([
      '@media (prefers-color-scheme: dark) > :root:not(.light) sets --background; define colours only in the top-level :root and .dark blocks',
    ])
  })

  it('fails when another block defines a new colour token', () => {
    const css = `${CSS}\n.sepia { --paper: #f4ecd8; --gap: 4px; }`
    expect(readThemes(css).errors).toEqual([
      '.sepia sets --paper; define colours only in the top-level :root and .dark blocks',
    ])
  })

  it('fails when a theme block is missing', () => {
    expect(readThemes(':root { --background: oklch(1 0 0); }').errors).toEqual([
      'no top-level .dark block with tokens',
    ])
  })
})

describe('isColorValue', () => {
  it('treats lengths, numbers and calc() as non-colours', () => {
    expect(isColorValue('0.625rem')).toBe(false)
    expect(isColorValue('4rem')).toBe(false)
    expect(isColorValue('1.5')).toBe(false)
    expect(isColorValue('calc(4rem + 1px)')).toBe(false)
  })

  it('treats anything else as a colour, so it must parse as oklch', () => {
    expect(isColorValue('oklch(1 0 0)')).toBe(true)
    expect(isColorValue('#fff')).toBe(true)
    expect(isColorValue('white')).toBe(true)
  })
})

describe('checkTheme', () => {
  const pairs: Array<Pair> = [
    { fg: 'foreground', bg: 'background', kind: 'text' },
    { fg: 'muted', bg: 'background', kind: 'text' },
    { fg: 'border', bg: 'background', kind: 'ui' },
  ]

  it('computes each pair against its minimum', () => {
    const tokens = new Map([
      ['background', 'oklch(1 0 0)'],
      ['foreground', 'oklch(0 0 0)'],
      ['muted', 'oklch(0.5 0 0)'],
      ['border', 'oklch(0.5 0 0)'],
    ])
    const { results, errors } = checkTheme(tokens, pairs)
    expect(errors).toEqual([])
    expect(results.map(({ min, pass }) => [min, pass])).toEqual([
      [7, true],
      [7, false],
      [3, true],
    ])
    expect(results[1].ratio).toBeCloseTo(6, 2)
  })

  it('fails pairs with a missing, translucent or out-of-gamut token', () => {
    const tokens = new Map([
      ['background', 'oklch(1 0 0)'],
      ['foreground', 'oklch(0 0 0 / 50%)'],
      ['muted', 'oklch(0.9 0.4 145)'],
    ])
    const { results, errors } = checkTheme(tokens, pairs)
    expect(
      results.every(({ pass, ratio }) => !pass && ratio === undefined),
    ).toBe(true)
    expect(errors).toEqual([
      expect.stringMatching(/^--foreground: .*alpha/),
      '--muted oklch(0.9 0.4 145) is outside the sRGB gamut',
      '--border is used in a pair but not defined',
    ])
  })
})

describe('checkTokenSets', () => {
  const pairs: Array<Pair> = [
    { fg: 'foreground', bg: 'background', kind: 'text' },
  ]

  it('passes when both themes define the same paired colour tokens', () => {
    const { light, dark } = readThemes(CSS)
    expect(checkTokenSets(light, dark, pairs)).toEqual([])
    expect(colorTokens(light)).toEqual(['background', 'foreground'])
  })

  it('fails on a token in one theme only, or in no pair', () => {
    const light = new Map([
      ['background', 'oklch(1 0 0)'],
      ['foreground', 'oklch(0 0 0)'],
      ['chart-1', 'oklch(0.6 0.1 40)'],
    ])
    const dark = new Map([
      ['background', 'oklch(0 0 0)'],
      ['foreground', 'oklch(1 0 0)'],
    ])
    expect(checkTokenSets(light, dark, pairs)).toEqual([
      '--chart-1 is defined in :root but not in the other theme',
      '--chart-1 is not checked by any pair',
    ])
  })
})

describe('findTranslucentTokens', () => {
  const tokens = ['ring', 'input', 'destructive', 'muted', 'muted-foreground']

  it('finds opacity modifiers on theme colours, with or without variants', () => {
    const source = `const c = cn(
      'focus-visible:ring-ring/50 ring-[3px] dark:bg-input/30',
      'bg-destructive/60 text-muted-foreground/[.8] outline-ring/50',
    )`
    expect(findTranslucentTokens(source, tokens, true)).toEqual([
      'ring-ring/50',
      'bg-input/30',
      'bg-destructive/60',
      'text-muted-foreground/[.8]',
      'outline-ring/50',
    ])
  })

  it('ignores full-opacity tokens, other colours and paths', () => {
    const source = `import x from '#/components/ui/input'
      const c = 'ring-ring bg-input text-muted-foreground bg-black/50'`
    expect(findTranslucentTokens(source, tokens, true)).toEqual([])
  })

  it('ignores comments but not strings that look like comments', () => {
    const source = `// ring-ring/50 is forbidden
      /* so is bg-input/30 */
      const glob = 'src/*'
      const c = 'ring-ring/50'
      const end = '*/'`
    expect(findTranslucentTokens(source, tokens, true)).toEqual([
      'ring-ring/50',
    ])
  })

  it('keeps // in CSS, where it is not a comment', () => {
    const css = `.a { background: url(https://example.com/x.png); }
      .b { @apply bg-input/30; }`
    expect(findTranslucentTokens(css, tokens, false)).toEqual(['bg-input/30'])
  })
})

describe('stripComments', () => {
  it('keeps an apostrophe in JSX text from hiding the next line', () => {
    const source = "<p>Don't</p>\n// gone\nkept"
    expect(stripComments(source, true)).toBe("<p>Don't</p>\n\nkept")
  })
})
