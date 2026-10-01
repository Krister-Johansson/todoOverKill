// @vitest-environment node
// ACTIVITY_TYPES lives beside the database client, which reads server
// variables that t3-env blocks under jsdom.
import { describe, expect, it } from 'vitest'

import { ACTIVITY_TYPES } from '#/server/activity'

import { FIELD_WORDS, describeActivity, fallbackSentence } from './activity'

/** A payload as its writer stores it, for every type. */
const SAMPLES: Record<string, unknown> = {
  'project.created': { name: 'Website', key: 'WEB' },
  'project.archived': { name: 'Website', key: 'WEB' },
  'task.created': { number: 1, title: 'Write copy' },
  'task.updated': { number: 1, fields: ['title'] },
  'task.moved': { number: 1, from: 'Backlog', to: 'In progress' },
  'task.completed': { number: 1 },
  'task.deleted': { number: 1, title: 'Write copy' },
  'comment.added': { body: 'Looks good' },
  'subtask.added': { title: 'Draft the intro' },
}

describe('describeActivity', () => {
  it('has a sentence for every activity type', () => {
    for (const type of Object.values(ACTIVITY_TYPES)) {
      expect(SAMPLES, type).toHaveProperty([type])
      const sentence = describeActivity({ type, payload: SAMPLES[type] })
      expect(sentence, type).not.toBe(fallbackSentence(type))
      expect(sentence, type).toMatch(/^[A-Z].*\.$/)
    }
  })

  it('reads each type as a sentence', () => {
    const sentences = Object.fromEntries(
      Object.entries(SAMPLES).map(([type, payload]) => [
        type,
        describeActivity({ type, payload }),
      ]),
    )
    expect(sentences).toEqual({
      'project.created': 'Created the project “Website”.',
      'project.archived': 'Archived the project “Website”.',
      'task.created': 'Created the task “Write copy”.',
      'task.updated': 'Changed the title.',
      'task.moved': 'Moved from Backlog to In progress.',
      'task.completed': 'Completed the task.',
      'task.deleted': 'Deleted the task “Write copy”.',
      'comment.added': 'Added a comment.',
      'subtask.added': 'Added the subtask “Draft the intro”.',
    })
  })

  it('has a word for every field a task.updated row can name', () => {
    const fields = ['title', 'description', 'priority', 'dueDate', 'labels']
    expect(Object.keys(FIELD_WORDS).sort()).toEqual([...fields].sort())
    for (const field of fields) {
      const sentence = describeActivity({
        type: 'task.updated',
        payload: { number: 1, fields: [field] },
      })
      expect(sentence).toBe(`Changed ${FIELD_WORDS[field]}.`)
    }
    expect(
      describeActivity({
        type: 'task.updated',
        payload: { number: 1, fields },
      }),
    ).toBe(
      'Changed the title, the description, the priority, the due date, and the labels.',
    )
  })

  it("reads the seed's task.moved row, which has no number", () => {
    expect(
      describeActivity({
        type: 'task.moved',
        payload: { from: 'Backlog', to: 'Done' },
      }),
    ).toBe('Moved from Backlog to Done.')
  })

  it('calls a move within one status a reorder', () => {
    expect(
      describeActivity({
        type: 'task.moved',
        payload: { number: 1, from: 'Backlog', to: 'Backlog' },
      }),
    ).toBe('Reordered within Backlog.')
  })

  it('names a field it has no word for', () => {
    expect(
      describeActivity({
        type: 'task.updated',
        payload: { number: 1, fields: ['title', 'estimate'] },
      }),
    ).toBe('Changed the title and estimate.')
  })

  it('falls back for an unknown type or a payload that does not match', () => {
    expect(describeActivity({ type: 'task.archived', payload: {} })).toBe(
      'Recorded the event “task.archived”.',
    )
    expect(
      describeActivity({ type: 'task.moved', payload: { from: 'Backlog' } }),
    ).toBe('Recorded the event “task.moved”.')
    expect(describeActivity({ type: 'task.created', payload: null })).toBe(
      'Recorded the event “task.created”.',
    )
  })
})
