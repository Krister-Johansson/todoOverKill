// Input types that take no typed text, so a letter pressed on them is free
// for a shortcut.
const NON_TEXT_INPUTS = new Set([
  'button',
  'checkbox',
  'image',
  'radio',
  'reset',
  'submit',
])

/**
 * Whether typing into `element` would put text in it or change its value: a
 * text input, a textarea, a select, or anything inside contenteditable.
 */
export function isEditableTarget(element: EventTarget | null) {
  if (!(element instanceof Element)) return false
  if (element instanceof HTMLInputElement) {
    return !NON_TEXT_INPUTS.has(element.type)
  }
  if (
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    return true
  }
  return (
    element.closest('[contenteditable]:not([contenteditable="false"])') !== null
  )
}

/**
 * Whether a dialog, an alert dialog or a menu is open anywhere in the
 * document. Radix renders these only while open, and each traps focus, so a
 * shortcut must not act behind one or stack a second focus scope on it.
 */
export function isModalOpen() {
  return (
    document.querySelector(
      '[role="dialog"], [role="alertdialog"], [role="menu"]',
    ) !== null
  )
}

/**
 * Whether a keydown may run a single-key shortcut such as `c` (2.1.4): no
 * Control, Command, or Alt, not a held key repeating, not mid-composition in
 * an input method, focus outside anything editable, and nothing modal open
 * (isModalOpen).
 */
export function isSingleKeyShortcut(event: KeyboardEvent) {
  if (event.defaultPrevented) return false
  if (event.ctrlKey || event.metaKey || event.altKey) return false
  if (event.repeat || event.isComposing) return false
  if (isEditableTarget(event.target)) return false
  return !isModalOpen()
}

/**
 * Whether a keydown is the command palette's key chord: Control+K, or
 * Command+K on a Mac, with no Alt or Shift. On a layout without Latin letters,
 * such as Russian, the key in the K position counts too; on one that moves
 * the letters, such as Dvorak, only the key that types k does.
 */
export function isCommandPaletteKey(event: KeyboardEvent) {
  if (!(event.ctrlKey || event.metaKey)) return false
  if (event.altKey || event.shiftKey) return false
  // Chrome's autofill dispatches a keydown with no key.
  if (typeof event.key !== 'string') return false
  const key = event.key.toLowerCase()
  if (key === 'k') return true
  return event.code === 'KeyK' && !/^[a-z]$/.test(key)
}

/**
 * Whether a keydown opens the command palette: its key chord
 * (isCommandPaletteKey), not a held key repeating, not mid-composition, and
 * nothing modal open (isModalOpen). Unlike a single-key shortcut it works
 * while typing in a field, and the single-key shortcuts setting does not turn
 * it off.
 */
export function isCommandPaletteShortcut(event: KeyboardEvent) {
  if (event.defaultPrevented) return false
  if (!isCommandPaletteKey(event)) return false
  if (event.repeat || event.isComposing) return false
  return !isModalOpen()
}
