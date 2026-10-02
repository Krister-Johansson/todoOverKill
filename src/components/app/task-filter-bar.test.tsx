import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { clearedFilters, hasActiveFilters } from '#/lib/task-filter'

import { TaskFilterBar } from './task-filter-bar'

import type { TaskFilters } from '#/lib/task-filter'

afterEach(() => {
  cleanup()
})

const statuses = [
  { id: 's1', name: 'Backlog' },
  { id: 's2', name: 'Done' },
]
const labels = [
  { id: 'l1', name: 'Bug' },
  { id: 'l2', name: 'Docs' },
]

function renderBar({
  filters = {},
  active = hasActiveFilters(filters),
  withLabels = true,
}: { filters?: TaskFilters; active?: boolean; withLabels?: boolean } = {}) {
  const onChange = vi.fn()
  const onClear = vi.fn()
  const view = render(
    <TaskFilterBar
      filters={filters}
      active={active}
      statuses={statuses}
      labels={withLabels ? labels : []}
      shown={3}
      total={12}
      onChange={onChange}
      onClear={onClear}
    />,
  )
  return { onChange, onClear, ...view }
}

describe('TaskFilterBar', () => {
  it('is a form named Filter tasks with a visible label on every field', () => {
    renderBar()
    expect(screen.getByRole('form', { name: 'Filter tasks' })).toBeTruthy()
    for (const name of ['Status', 'Priority', 'Label', 'Due']) {
      expect(screen.getByRole('combobox', { name })).toBeTruthy()
    }
    expect(screen.getByRole('searchbox', { name: 'Text' })).toBeTruthy()
  })

  it('applies a select at once, merged with the other filters', () => {
    const { onChange } = renderBar({ filters: { q: 'copy' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), {
      target: { value: 's2' },
    })
    expect(onChange).toHaveBeenLastCalledWith({ q: 'copy', status: 's2' })
    fireEvent.change(screen.getByRole('combobox', { name: 'Due' }), {
      target: { value: 'overdue' },
    })
    expect(onChange).toHaveBeenLastCalledWith({ q: 'copy', due: 'overdue' })
  })

  it('maps Any back to no filter', () => {
    const { onChange } = renderBar({ filters: { priority: 'high' } })
    const priority = screen.getByRole<HTMLSelectElement>('combobox', {
      name: 'Priority',
    })
    expect(priority.value).toBe('high')
    fireEvent.change(priority, { target: { value: '' } })
    expect(onChange).toHaveBeenLastCalledWith({ priority: undefined })
  })

  it('applies the text only on submit', () => {
    const { onChange } = renderBar()
    const text = screen.getByRole('searchbox', { name: 'Text' })
    fireEvent.change(text, { target: { value: ' login ' } })
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(onChange).toHaveBeenLastCalledWith({ q: 'login' })
  })

  it('submits the text from Enter in the field', () => {
    const { onChange } = renderBar()
    const text = screen.getByRole('searchbox', { name: 'Text' })
    fireEvent.change(text, { target: { value: 'copy' } })
    fireEvent.submit(text.closest('form')!)
    expect(onChange).toHaveBeenLastCalledWith({ q: 'copy' })
  })

  it('shows the text from the URL and resets it when the URL changes', () => {
    const { rerender } = renderBar({ filters: { q: 'copy' } })
    const text = screen.getByRole<HTMLInputElement>('searchbox', {
      name: 'Text',
    })
    expect(text.value).toBe('copy')
    rerender(
      <TaskFilterBar
        filters={clearedFilters()}
        active={false}
        statuses={statuses}
        labels={labels}
        shown={12}
        total={12}
        onChange={vi.fn()}
        onClear={vi.fn()}
      />,
    )
    expect(text.value).toBe('')
  })

  it('clears only when a filter is active, without disabling the button', () => {
    const idle = renderBar()
    const clear = screen.getByRole('button', { name: 'Clear filters' })
    expect(clear.getAttribute('aria-disabled')).toBe('true')
    expect(clear.hasAttribute('disabled')).toBe(false)
    fireEvent.click(clear)
    expect(idle.onClear).not.toHaveBeenCalled()
    cleanup()

    const { onClear } = renderBar({ filters: { due: 'today' } })
    const active = screen.getByRole('button', { name: 'Clear filters' })
    expect(active.getAttribute('aria-disabled')).toBe('false')
    fireEvent.click(active)
    expect(onClear).toHaveBeenCalledOnce()
  })

  it('clears a stale filter the controls cannot show', () => {
    const { onClear } = renderBar({ filters: {}, active: true })
    const clear = screen.getByRole('button', { name: 'Clear filters' })
    expect(clear.getAttribute('aria-disabled')).toBe('false')
    fireEvent.click(clear)
    expect(onClear).toHaveBeenCalledOnce()
  })

  it('resets unapplied text on Clear and on a select change', () => {
    const { onChange, onClear } = renderBar({ filters: { q: 'copy' } })
    const text = screen.getByRole<HTMLInputElement>('searchbox', {
      name: 'Text',
    })
    fireEvent.change(text, { target: { value: 'copy edits' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Due' }), {
      target: { value: 'today' },
    })
    expect(onChange).toHaveBeenLastCalledWith({ q: 'copy', due: 'today' })
    expect(text.value).toBe('copy')

    fireEvent.change(text, { target: { value: 'login' } })
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(onClear).toHaveBeenCalledOnce()
    expect(text.value).toBe('')
  })

  it('lets Clear empty typed text when no filter is applied', () => {
    const { onClear } = renderBar()
    const text = screen.getByRole<HTMLInputElement>('searchbox', {
      name: 'Text',
    })
    fireEvent.change(text, { target: { value: 'login' } })
    const clear = screen.getByRole('button', { name: 'Clear filters' })
    expect(clear.getAttribute('aria-disabled')).toBe('false')
    fireEvent.click(clear)
    expect(text.value).toBe('')
    expect(onClear).not.toHaveBeenCalled()
    expect(clear.getAttribute('aria-disabled')).toBe('true')
  })

  it('removes the text filter when the field is emptied with search', () => {
    const { onChange } = renderBar({ filters: { q: 'copy', due: 'week' } })
    const text = screen.getByRole('searchbox', { name: 'Text' })
    fireEvent.change(text, { target: { value: '' } })
    expect(onChange).not.toHaveBeenCalled()
    fireEvent(text, new Event('search'))
    expect(onChange).toHaveBeenLastCalledWith({ q: undefined, due: 'week' })
  })

  it('applies once when Enter fires search and submits the form', () => {
    const { onChange } = renderBar({ filters: { q: 'copy' } })
    const text = screen.getByRole('searchbox', { name: 'Text' })
    fireEvent.change(text, { target: { value: '' } })
    // Chrome's order for Enter in an emptied search field.
    fireEvent.submit(text.closest('form')!)
    fireEvent(text, new Event('search'))
    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenLastCalledWith({ q: undefined })
    cleanup()

    const other = renderBar({ filters: { q: 'copy' } })
    const field = screen.getByRole('searchbox', { name: 'Text' })
    fireEvent.change(field, { target: { value: '' } })
    fireEvent(field, new Event('search'))
    fireEvent.submit(field.closest('form')!)
    expect(other.onChange).toHaveBeenCalledOnce()
  })

  it('does not apply text that is already applied', () => {
    const { onChange } = renderBar({ filters: { q: 'copy' } })
    const text = screen.getByRole<HTMLInputElement>('searchbox', {
      name: 'Text',
    })
    fireEvent.change(text, { target: { value: ' copy ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(onChange).not.toHaveBeenCalled()
    expect(text.value).toBe('copy')
  })

  it('ignores search while the field still has text', () => {
    const { onChange } = renderBar({ filters: { q: 'copy' } })
    const text = screen.getByRole('searchbox', { name: 'Text' })
    fireEvent.change(text, { target: { value: 'cop' } })
    fireEvent(text, new Event('search'))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('lets the results line take focus from script only', () => {
    renderBar()
    const results = screen.getByText('Showing 3 of 12 tasks')
    expect(results.getAttribute('tabindex')).toBe('-1')
  })

  it('has no Label field for a project without labels', () => {
    renderBar({ withLabels: false })
    expect(screen.queryByRole('combobox', { name: 'Label' })).toBeNull()
  })

  it('shows how many tasks are shown', () => {
    renderBar()
    expect(screen.getByText('Showing 3 of 12 tasks')).toBeTruthy()
  })
})
