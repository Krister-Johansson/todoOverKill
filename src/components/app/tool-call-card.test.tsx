import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { ToolCallCard } from './tool-call-card'

import type { ToolCallPart } from '#/lib/tool-call'

afterEach(cleanup)

function part(fields: Partial<ToolCallPart> = {}): ToolCallPart {
  return {
    type: 'tool-call',
    id: 'call-1',
    name: 'list_tasks',
    arguments: '{"projectId":"p1"}',
    state: 'input-complete',
    ...fields,
  }
}

function card() {
  return screen.getByRole('group', { name: 'Tool call: List tasks' })
}

describe('ToolCallCard', () => {
  it('shows the name, Done and the summary of a finished call', () => {
    render(
      <ToolCallCard
        part={part({
          state: 'complete',
          output: { tasks: [{ title: 'A'.repeat(500) }, { title: 'B' }] },
        })}
        isLoading={false}
      />,
    )
    expect(card().textContent).toBe('List tasksDone2 tasks')
  })

  it('shows Running while the reply loads', () => {
    render(<ToolCallCard part={part()} isLoading />)
    expect(card().textContent).toBe('List tasksRunning')
  })

  it('shows Stopped when the reply ended first', () => {
    render(<ToolCallCard part={part()} isLoading={false} />)
    expect(card().textContent).toBe('List tasksStopped')
  })

  it('shows Failed and the error', () => {
    render(
      <ToolCallCard
        part={part({
          state: 'error',
          output: { error: 'No project with id p1.' },
        })}
        isLoading={false}
      />,
    )
    expect(within(card()).getByText('Failed')).toBeTruthy()
    expect(within(card()).getByText('No project with id p1.')).toBeTruthy()
    expect(card().textContent).not.toContain('Done')
  })

  it('shows Failed for an error output not marked as an error', () => {
    render(
      <ToolCallCard
        part={part({ state: 'complete', output: { error: 'No task.' } })}
        isLoading={false}
      />,
    )
    expect(card().textContent).toBe('List tasksFailedNo task.')
  })

  it('shows Needs approval while asking for it', () => {
    render(
      <ToolCallCard part={part({ state: 'approval-requested' })} isLoading />,
    )
    expect(card().textContent).toBe('List tasksNeeds approval')
  })

  it('hides the icon from screen readers', () => {
    render(<ToolCallCard part={part()} isLoading />)
    for (const icon of card().querySelectorAll('svg')) {
      expect(icon.getAttribute('aria-hidden')).toBe('true')
    }
  })
})
