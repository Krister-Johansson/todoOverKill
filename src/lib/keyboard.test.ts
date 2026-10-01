import { afterEach, describe, expect, it } from 'vitest'

import { isEditableTarget, isSingleKeyShortcut } from '#/lib/keyboard'

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
})
