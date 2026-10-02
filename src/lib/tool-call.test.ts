import { describe, expect, it } from 'vitest'

import {
  toolCallStatus,
  toolDisplayName,
  toolErrorText,
  toolResultSummary,
  withAnsweredToolCalls,
} from './tool-call'

import type { ToolCallPart, ToolResultPart } from './tool-call'

function toolCall(fields: Partial<ToolCallPart> = {}): ToolCallPart {
  return {
    type: 'tool-call',
    id: 'call-1',
    name: 'list_tasks',
    arguments: '{"projectId":"p1"}',
    state: 'input-complete',
    ...fields,
  }
}

function toolResult(fields: Partial<ToolResultPart> = {}): ToolResultPart {
  return {
    type: 'tool-result',
    toolCallId: 'call-1',
    content: '{"tasks":[]}',
    state: 'complete',
    ...fields,
  }
}

describe('toolDisplayName', () => {
  it('turns a tool name into plain words', () => {
    expect(toolDisplayName('list_tasks')).toBe('List tasks')
    expect(toolDisplayName('search')).toBe('Search')
  })
})

describe('toolCallStatus', () => {
  it('is running while the reply loads and the tool has no output', () => {
    expect(
      toolCallStatus(toolCall({ state: 'input-streaming' }), undefined, true),
    ).toBe('running')
    expect(toolCallStatus(toolCall(), undefined, true)).toBe('running')
  })

  it('is stopped when the reply ended before the tool did', () => {
    expect(toolCallStatus(toolCall(), undefined, false)).toBe('stopped')
  })

  it('is done once the tool has output', () => {
    const part = toolCall({ state: 'complete', output: { tasks: [] } })
    expect(toolCallStatus(part, toolResult(), true)).toBe('done')
    expect(toolCallStatus(part, undefined, false)).toBe('done')
  })

  it('is failed for the error state and for an error output', () => {
    expect(
      toolCallStatus(
        toolCall({ state: 'error', output: { error: 'No project.' } }),
        undefined,
        false,
      ),
    ).toBe('failed')
    // chat()'s output for a thrown error when the stream does not mark it.
    expect(
      toolCallStatus(
        toolCall({ state: 'complete', output: { error: 'No project.' } }),
        undefined,
        false,
      ),
    ).toBe('failed')
  })

  it('needs approval while asking for it', () => {
    expect(
      toolCallStatus(
        toolCall({ state: 'approval-requested' }),
        undefined,
        true,
      ),
    ).toBe('needs-approval')
  })
})

describe('toolErrorText', () => {
  it('reads the error from the output, the result or chat()s text', () => {
    expect(
      toolErrorText(
        toolCall({
          state: 'error',
          output: { error: 'No project with id p1.' },
        }),
      ),
    ).toBe('No project with id p1.')
    expect(toolErrorText(toolCall({ output: { error: 'No task.' } }))).toBe(
      'No task.',
    )
    expect(
      toolErrorText(
        toolCall({ state: 'error' }),
        toolResult({ state: 'error', error: 'Bad input.' }),
      ),
    ).toBe('Bad input.')
    expect(
      toolErrorText(toolCall({ output: 'Error executing tool: Timed out' })),
    ).toBe('Timed out')
    expect(toolErrorText(toolCall({ state: 'error' }))).toBe('The tool failed.')
  })

  it('is undefined for a call that did not fail', () => {
    expect(toolErrorText(toolCall({ output: { tasks: [] } }))).toBeUndefined()
    expect(toolErrorText(toolCall())).toBeUndefined()
  })
})

describe('toolResultSummary', () => {
  it('counts a list', () => {
    expect(toolResultSummary({ tasks: [{}, {}] })).toBe('2 tasks')
    expect(toolResultSummary({ projects: [{}] })).toBe('1 project')
    expect(toolResultSummary({ subtasks: [] })).toBe('0 subtasks')
    expect(toolResultSummary({ labels: [{}] })).toBe('1 label')
    expect(toolResultSummary({ comments: [{}, {}, {}] })).toBe('3 comments')
  })

  it('counts both lists of a search', () => {
    expect(toolResultSummary({ projects: [{}], tasks: [{}, {}] })).toBe(
      '1 project and 2 tasks',
    )
  })

  it('names a single item, cut short', () => {
    expect(toolResultSummary({ title: 'Fix login', number: 4 })).toBe(
      'Fix login',
    )
    expect(toolResultSummary({ name: 'Website', key: 'WEB' })).toBe('Website')
    const body = `${'word '.repeat(200)}end`
    const summary = toolResultSummary({ body })
    expect(summary.length).toBeLessThanOrEqual(60)
    expect(summary.endsWith('…')).toBe(true)
  })

  it('never shows a full result', () => {
    const comments = Array.from({ length: 50 }, () => ({
      body: 'x'.repeat(5_000),
    }))
    expect(toolResultSummary({ comments })).toBe('50 comments')
    expect(toolResultSummary('x'.repeat(5_000))).toBe('Done')
    expect(toolResultSummary(undefined)).toBe('Done')
  })
})

describe('withAnsweredToolCalls', () => {
  const user = {
    id: 'u1',
    role: 'user' as const,
    parts: [{ type: 'text' as const, content: 'Which tasks?' }],
  }

  it('keeps a tool call with its output or result', () => {
    const messages = [
      user,
      {
        id: 'a1',
        role: 'assistant' as const,
        parts: [
          toolCall({ state: 'complete', output: { tasks: [] } }),
          toolResult(),
          { type: 'text' as const, content: 'None.' },
        ],
      },
    ]
    const kept = withAnsweredToolCalls(messages)
    expect(kept).toEqual(messages)
    expect(kept[1]).toBe(messages[1])
  })

  it('drops a tool call that Stop left without a result, and keeps the text', () => {
    const kept = withAnsweredToolCalls([
      user,
      {
        id: 'a1',
        role: 'assistant' as const,
        parts: [{ type: 'text' as const, content: 'Looking.' }, toolCall()],
      },
    ])
    expect(kept[1].parts).toEqual([{ type: 'text', content: 'Looking.' }])
  })

  it('drops a result whose call is gone, and a reply left empty', () => {
    const kept = withAnsweredToolCalls([
      user,
      { id: 'a1', role: 'assistant' as const, parts: [toolCall()] },
      { id: 'a2', role: 'assistant' as const, parts: [toolResult()] },
    ])
    expect(kept).toEqual([user])
  })

  it('passes messages without parts through', () => {
    const messages = [{ id: 'm1' }, { id: 'm2' }]
    expect(withAnsweredToolCalls(messages)).toEqual(messages)
  })
})
