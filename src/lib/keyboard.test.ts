import { afterEach, describe, expect, it } from 'vitest'

import {
  isCommandPaletteKey,
  isCommandPaletteShortcut,
  isEditableTarget,
  isModalOpen,
  isSingleKeyShortcut,
} from '#/lib/keyboard'

afterEach(() => {
  document.body.innerHTML = ''
})

function element(html: string) {
  document.body.innerHTML = html
  const first = document.body.firstElementChild
  if (!first) throw new Error('no element')
  return first
}

/** Dispatches a keydown on `target` and returns the event it received. */
function keydown(target: EventTarget, init: KeyboardEventInit = {}) {
  let received: KeyboardEvent | undefined
  target.addEventListener('keydown', (event) => {
    received = event as KeyboardEvent
  })
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'c', bubbles: true, ...init }),
  )
  if (!received) throw new Error('no event')
  return received
}

describe('isEditableTarget', () => {
  it.each([
    '<input>',
    '<input type="search">',
    '<input type="date">',
    '<textarea></textarea>',
    '<select><option>One</option></select>',
    '<div contenteditable="true"></div>',
  ])('is true for %s', (html) => {
    expect(isEditableTarget(element(html))).toBe(true)
  })

  it('is true inside contenteditable', () => {
    const outer = element('<div contenteditable><p>Text</p></div>')
    expect(isEditableTarget(outer.querySelector('p'))).toBe(true)
  })

  it.each([
    '<button>Go</button>',
    '<a href="#x">Link</a>',
    '<input type="checkbox">',
    '<input type="radio">',
    '<div contenteditable="false"></div>',
  ])('is false for %s', (html) => {
    expect(isEditableTarget(element(html))).toBe(false)
  })

  it('is false for no target', () => {
    expect(isEditableTarget(null)).toBe(false)
    expect(isEditableTarget(window)).toBe(false)
  })
})

describe('isSingleKeyShortcut', () => {
  it('passes a plain key on a button', () => {
    expect(isSingleKeyShortcut(keydown(element('<button>Go</button>')))).toBe(
      true,
    )
  })

  it.each(['ctrlKey', 'metaKey', 'altKey'] as const)(
    'fails with %s held',
    (modifier) => {
      const event = keydown(element('<button>Go</button>'), {
        [modifier]: true,
      })
      expect(isSingleKeyShortcut(event)).toBe(false)
    },
  )

  it('passes with Shift held', () => {
    const event = keydown(element('<button>Go</button>'), { shiftKey: true })
    expect(isSingleKeyShortcut(event)).toBe(true)
  })

  it('fails on a repeating key', () => {
    const event = keydown(element('<button>Go</button>'), { repeat: true })
    expect(isSingleKeyShortcut(event)).toBe(false)
  })

  it('fails while composing', () => {
    const event = keydown(element('<button>Go</button>'), {
      isComposing: true,
    })
    expect(isSingleKeyShortcut(event)).toBe(false)
  })

  it('fails in a text field', () => {
    expect(isSingleKeyShortcut(keydown(element('<input>')))).toBe(false)
  })

  it('fails once another handler prevented the default', () => {
    const button = element('<button>Go</button>')
    button.addEventListener('keydown', (event) => event.preventDefault())
    const event = keydown(button, { cancelable: true })
    expect(isSingleKeyShortcut(event)).toBe(false)
  })

  it('fails while a dialog is open anywhere in the document', () => {
    document.body.innerHTML =
      '<button>Go</button><div role="dialog" aria-label="New task"></div>'
    const button = document.querySelector('button')!
    expect(isSingleKeyShortcut(keydown(button))).toBe(false)
  })

  it('fails while a menu is open', () => {
    document.body.innerHTML =
      '<div role="menu" aria-label="Move"><button role="menuitem">Go</button></div>'
    const item = document.querySelector('button')!
    expect(isSingleKeyShortcut(keydown(item))).toBe(false)
  })
})

describe('isModalOpen', () => {
  it.each(['dialog', 'alertdialog', 'menu'])('is true with a %s', (role) => {
    document.body.innerHTML = `<div role="${role}"></div>`
    expect(isModalOpen()).toBe(true)
  })

  it('is false with none', () => {
    document.body.innerHTML = '<div role="listbox"></div>'
    expect(isModalOpen()).toBe(false)
  })

  it('ignores a non-modal dialog such as the assistant panel', () => {
    document.body.innerHTML = '<div role="dialog" data-modal="false"></div>'
    expect(isModalOpen()).toBe(false)
  })

  it('is true with a modal dialog beside a non-modal one', () => {
    document.body.innerHTML =
      '<div role="dialog" data-modal="false"></div><div role="dialog"></div>'
    expect(isModalOpen()).toBe(true)
  })
})

describe('isCommandPaletteKey', () => {
  it('passes the K key on a layout without Latin letters', () => {
    const event = keydown(element('<button>Go</button>'), {
      key: 'л',
      code: 'KeyK',
      ctrlKey: true,
    })
    expect(isCommandPaletteKey(event)).toBe(true)
  })

  it('fails on the K position when it types another letter', () => {
    // Dvorak puts t there, and Control+T opens a tab.
    const event = keydown(element('<button>Go</button>'), {
      key: 't',
      code: 'KeyK',
      ctrlKey: true,
    })
    expect(isCommandPaletteKey(event)).toBe(false)
  })

  it('fails while composing and once another handler prevented the default', () => {
    const button = element('<button>Go</button>')
    const init = { key: 'k', ctrlKey: true }
    expect(
      isCommandPaletteKey(keydown(button, { ...init, isComposing: true })),
    ).toBe(false)
    button.addEventListener('keydown', (event) => event.preventDefault())
    const event = keydown(button, { ...init, cancelable: true })
    expect(isCommandPaletteKey(event)).toBe(false)
  })

  it('passes the chord while a dialog is open', () => {
    document.body.innerHTML = '<input><div role="dialog"></div>'
    const input = document.querySelector('input')!
    const event = keydown(input, { key: 'k', ctrlKey: true })
    expect(isCommandPaletteKey(event)).toBe(true)
    expect(isCommandPaletteShortcut(event)).toBe(false)
  })
})

describe('isCommandPaletteShortcut', () => {
  it.each(['ctrlKey', 'metaKey'] as const)('passes k with %s', (modifier) => {
    const event = keydown(element('<button>Go</button>'), {
      key: 'k',
      [modifier]: true,
    })
    expect(isCommandPaletteShortcut(event)).toBe(true)
  })

  it('passes K with Caps Lock on', () => {
    const event = keydown(element('<button>Go</button>'), {
      key: 'K',
      ctrlKey: true,
    })
    expect(isCommandPaletteShortcut(event)).toBe(true)
  })

  it('passes in a text field, unlike a single-key shortcut', () => {
    const event = keydown(element('<input>'), { key: 'k', ctrlKey: true })
    expect(isCommandPaletteShortcut(event)).toBe(true)
  })

  it('fails on k alone and on another key', () => {
    const button = element('<button>Go</button>')
    expect(isCommandPaletteShortcut(keydown(button, { key: 'k' }))).toBe(false)
    expect(
      isCommandPaletteShortcut(keydown(button, { key: 'j', ctrlKey: true })),
    ).toBe(false)
  })

  it.each(['altKey', 'shiftKey'] as const)('fails with %s held', (modifier) => {
    const event = keydown(element('<button>Go</button>'), {
      key: 'k',
      ctrlKey: true,
      [modifier]: true,
    })
    expect(isCommandPaletteShortcut(event)).toBe(false)
  })

  it('fails on a repeating key and while composing', () => {
    const button = element('<button>Go</button>')
    const init = { key: 'k', ctrlKey: true }
    expect(
      isCommandPaletteShortcut(keydown(button, { ...init, repeat: true })),
    ).toBe(false)
    expect(
      isCommandPaletteShortcut(keydown(button, { ...init, isComposing: true })),
    ).toBe(false)
  })

  it('fails once another handler prevented the default', () => {
    const button = element('<button>Go</button>')
    button.addEventListener('keydown', (event) => event.preventDefault())
    const event = keydown(button, { key: 'k', ctrlKey: true, cancelable: true })
    expect(isCommandPaletteShortcut(event)).toBe(false)
  })

  it('fails while a dialog is open anywhere in the document', () => {
    document.body.innerHTML =
      '<input><div role="dialog" aria-label="Command menu"></div>'
    const input = document.querySelector('input')!
    expect(
      isCommandPaletteShortcut(keydown(input, { key: 'k', ctrlKey: true })),
    ).toBe(false)
  })

  it('fails while a menu is open', () => {
    document.body.innerHTML =
      '<div role="menu" aria-label="Move"><button role="menuitem">Go</button></div>'
    const item = document.querySelector('button')!
    expect(
      isCommandPaletteShortcut(keydown(item, { key: 'k', ctrlKey: true })),
    ).toBe(false)
  })
})
