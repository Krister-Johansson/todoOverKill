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
 * Whether a keydown may run a single-key shortcut such as `c` (2.1.4): no
 * Control, Command, or Alt, not a held key repeating, not mid-composition in
 * an input method, focus outside anything editable, and no dialog open, so a
 * shortcut never acts behind a modal or opens a second dialog.
 */
export function isSingleKeyShortcut(event: KeyboardEvent) {
  if (event.defaultPrevented) return false
  if (event.ctrlKey || event.metaKey || event.altKey) return false
  if (event.repeat || event.isComposing) return false
  if (isEditableTarget(event.target)) return false
  return (
    document.querySelector('[role="dialog"], [role="alertdialog"]') === null
  )
}

/**
 * Whether a keydown opens the command palette: Control+K, or Command+K on a
 * Mac, with no Alt or Shift, not a held key repeating, not mid-composition,
 * and no dialog open, so it never acts behind a modal or stacks a second one.
 * Unlike a single-key shortcut it works while typing in a field, and the
 * single-key shortcuts setting does not turn it off.
 */
export function isCommandPaletteShortcut(event: KeyboardEvent) {
  if (event.defaultPrevented) return false
  // Chrome's autofill dispatches a keydown with no key.
  if (typeof event.key !== 'string' || event.key.toLowerCase() !== 'k') {
    return false
  }
  if (!(event.ctrlKey || event.metaKey)) return false
  if (event.altKey || event.shiftKey) return false
  if (event.repeat || event.isComposing) return false
  return (
    document.querySelector('[role="dialog"], [role="alertdialog"]') === null
  )
}
