// @vitest-environment node
// ACTIVITY_TYPES lives beside the database client, which reads server
// variables that t3-env blocks under jsdom.
import { describe, expect, it } from 'vitest'

import { ACTIVITY_TYPES } from '#/server/activity'

import {
  FIELD_WORDS,
  SUBTASK_FIELD_WORDS,
  describeActivity,
  fallbackSentence,
} from './activity'

/** A payload as its writer stores it, for every type. */
const SAMPLES: Record<string, unknown> = {
  'project.created': { name: 'Website', key: 'WEB' },
  'project.archived': { name: 'Website', key: 'WEB' },
  'task.created': { number: 1, title: 'Write copy' },
  'task.updated': { number: 1, fields: ['title'] },
  'task.moved': { number: 1, from: 'Backlog', to: 'In progress' },
  'task.completed': { number: 1 },
  'task.deleted': { number: 1, title: 'Write copy' },
  'comment.added': { number: 1, excerpt: 'Looks good' },
  'comment.updated': { number: 1, excerpt: 'Looks good' },
  'comment.deleted': { number: 1, excerpt: 'Looks good' },
  'subtask.added': { number: 1, title: 'Draft the intro' },
  'subtask.updated': { number: 1, title: 'Draft the intro', fields: ['title'] },
  'subtask.completed': { number: 1, title: 'Draft the intro' },
  'subtask.reopened': { number: 1, title: 'Draft the intro' },
  'subtask.moved': { number: 1, title: 'Draft the intro', from: 2, to: 0 },
  'subtask.deleted': { number: 1, title: 'Draft the intro' },
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
      'comment.added': 'Added the comment “Looks good”.',
      'comment.updated': 'Edited the comment “Looks good”.',
      'comment.deleted': 'Deleted the comment “Looks good”.',
      'subtask.added': 'Added the subtask “Draft the intro”.',
      'subtask.updated': 'Changed the title of the subtask “Draft the intro”.',
      'subtask.completed': 'Completed the subtask “Draft the intro”.',
      'subtask.reopened': 'Reopened the subtask “Draft the intro”.',
      'subtask.moved':
        'Moved the subtask “Draft the intro” from position 3 to 1.',
      'subtask.deleted': 'Deleted the subtask “Draft the intro”.',
    })
  })

  it("reads the seed's subtask.added row, which has no number", () => {
    expect(
      describeActivity({
        type: 'subtask.added',
        payload: { title: 'Draft the intro' },
      }),
    ).toBe('Added the subtask “Draft the intro”.')
  })

  it('reads an older comment.added row, which has only body', () => {
    for (const payload of [{ body: 'Looks good' }, {}]) {
      const sentence = describeActivity({ type: 'comment.added', payload })
      expect(sentence).toBe('Added a comment.')
      expect(sentence).not.toBe(fallbackSentence('comment.added'))
    }
  })

  it('has a word for every field a subtask.updated row can name', () => {
    expect(Object.keys(SUBTASK_FIELD_WORDS).sort()).toEqual(['done', 'title'])
    // An older row, without the new done value.
    expect(
      describeActivity({
        type: 'subtask.updated',
        payload: { number: 1, title: 'Ship', fields: ['title', 'done'] },
      }),
    ).toBe('Changed the title and the done state of the subtask “Ship”.')
  })

  it('says whether a rename with a toggle completed or reopened the subtask', () => {
    const fields = ['title', 'done']
    expect(
      describeActivity({
        type: 'subtask.updated',
        payload: { number: 1, title: 'Ship', fields, done: true },
      }),
    ).toBe('Renamed and completed the subtask “Ship”.')
    expect(
      describeActivity({
        type: 'subtask.updated',
        payload: { number: 1, title: 'Ship', fields, done: false },
      }),
    ).toBe('Renamed and reopened the subtask “Ship”.')
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
