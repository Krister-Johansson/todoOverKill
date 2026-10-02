/**
 * The colours a project or label can have. Each reaches 3:1 against every
 * CHIP_SURFACES token in both themes (docs/accessibility.md 1.4.11), which
 * project-colors.test.ts checks against src/styles.css. The colour is never
 * the only cue: the name is shown wherever the swatch is chosen.
 */
export const PROJECT_COLORS = [
  { name: 'Blue', value: '#2563eb' },
  { name: 'Green', value: '#15803d' },
  { name: 'Red', value: '#dc2626' },
  { name: 'Amber', value: '#b45309' },
  { name: 'Violet', value: '#8b5cf6' },
  { name: 'Pink', value: '#db2777' },
  { name: 'Teal', value: '#0f766e' },
  { name: 'Slate', value: '#64748b' },
] as const

/**
 * The only theme tokens a project or label colour may be painted on: the page,
 * card, popover and sidebar surfaces.
 */
export const CHIP_SURFACES = [
  'background',
  'card',
  'popover',
  'sidebar',
] as const

/**
 * Surfaces painted behind a chip while its container is hovered: the board
 * and dashboard cards paint --accent. project-colors.test.ts measures the
 * palette on each.
 */
export const CHIP_HOVER_SURFACES = ['accent'] as const

/** The palette name for a hex value, or undefined for a colour not in it. */
export function projectColorName(value: string | null | undefined) {
  if (!value) return undefined
  const lower = value.toLowerCase()
  return PROJECT_COLORS.find((color) => color.value === lower)?.name
}
