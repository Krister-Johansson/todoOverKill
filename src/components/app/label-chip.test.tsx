import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { CHIP_FILL } from '#/lib/project-colors'

import { LabelChip } from './label-chip'

afterEach(cleanup)

function chip(name: string) {
  return screen.getByText(name).parentElement!
}

describe('LabelChip', () => {
  it('shows the name beside a decorative dot', () => {
    render(<LabelChip label={{ name: 'Bug', color: '#dc2626' }} />)
    const dot = chip('Bug').querySelector<HTMLElement>('[aria-hidden="true"]')
    expect(dot?.textContent).toBe('')
    expect(dot?.style.backgroundColor).toBe('rgb(220, 38, 38)')
    expect(chip('Bug').textContent).toBe('Bug')
  })

  it('paints a palette colour, in any case, on the border', () => {
    render(<LabelChip label={{ name: 'Bug', color: '#DC2626' }} />)
    expect(chip('Bug').classList).toContain('border-2')
    expect(chip('Bug').classList).not.toContain('border-border')
    expect(chip('Bug').style.borderColor).toBe('rgb(220, 38, 38)')
  })

  it('uses the theme border for a colour outside the palette', () => {
    render(<LabelChip label={{ name: 'Old', color: '#7c3aed' }} />)
    expect(chip('Old').classList).toContain('border-2')
    expect(chip('Old').classList).toContain('border-border')
    expect(chip('Old').style.borderColor).toBe('')
  })

  it('carries its own checked surface under the border', () => {
    render(<LabelChip label={{ name: 'Bug', color: '#dc2626' }} />)
    expect(chip('Bug').classList).toContain(`bg-${CHIP_FILL}`)
  })

  it('merges a class name', () => {
    render(
      <LabelChip
        label={{ name: 'Bug', color: '#dc2626' }}
        className="text-xs"
      />,
    )
    expect(chip('Bug').classList).toContain('text-xs')
    expect(chip('Bug').classList).toContain('rounded-full')
  })
})
