/**
 * The colours a project can have. Each reaches 3:1 against the page and the
 * sidebar in both themes (docs/accessibility.md 1.4.11), which
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

/** The palette name for a hex value, or undefined for a colour not in it. */
export function projectColorName(value: string | null | undefined) {
  if (!value) return undefined
  const lower = value.toLowerCase()
  return PROJECT_COLORS.find((color) => color.value === lower)?.name
}
