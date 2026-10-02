// @vitest-environment node
// The server module imports the database client, which reads server variables
// that t3-env blocks under jsdom.
import { describe, expect, it } from 'vitest'

import {
  activityPayloadSchemas,
  activityRowSchema,
  activityTypeSchema,
} from '#/schemas/activity'
import { ACTIVITY_TYPES } from '#/server/activity'

describe('activityTypeSchema', () => {
  it('lists the same types as ACTIVITY_TYPES', () => {
    expect([...activityTypeSchema.options].sort()).toEqual(
      Object.values(ACTIVITY_TYPES).sort(),
    )
  })

  it('has a payload schema for every type', () => {
    expect(Object.keys(activityPayloadSchemas).sort()).toEqual(
      [...activityTypeSchema.options].sort(),
    )
  })
})

describe('activityPayloadSchemas', () => {
  it("accepts the seed's payloads, which have no number", () => {
    expect(
      activityPayloadSchemas['task.moved'].safeParse({
        from: 'Backlog',
        to: 'Done',
      }).success,
    ).toBe(true)
    expect(
      activityPayloadSchemas['subtask.added'].safeParse({ title: 'Draft' })
        .success,
    ).toBe(true)
    expect(
      activityPayloadSchemas['comment.added'].safeParse({ body: 'Looks good' })
        .success,
    ).toBe(true)
  })

  it('accepts the comment payloads, old and new', () => {
    for (const type of [
      'comment.added',
      'comment.updated',
      'comment.deleted',
    ] as const) {
      const schema = activityPayloadSchemas[type]
      expect(
        schema.safeParse({ number: 1, commentId: 'c1' }).success,
        type,
      ).toBe(true)
      expect(
        schema.safeParse({ number: 1, excerpt: 'Looks good' }).success,
        type,
      ).toBe(true)
      expect(schema.safeParse({ body: 'Looks good' }).success, type).toBe(true)
      expect(schema.safeParse({}).success, type).toBe(true)
    }
  })

  it('keeps keys it does not know', () => {
    expect(
      activityPayloadSchemas['task.completed'].parse({ number: 3, by: 'me' }),
    ).toEqual({ number: 3, by: 'me' })
  })

  it('rejects a task.updated payload without fields', () => {
    expect(
      activityPayloadSchemas['task.updated'].safeParse({
        number: 1,
        fields: [],
      }).success,
    ).toBe(false)
  })
})

describe('activityRowSchema', () => {
  it('takes createdAt as a Date', () => {
    const row = {
      id: 'a1',
      type: 'task.completed',
      payload: { number: 1 },
      createdAt: new Date('2026-10-01T12:00:00.000Z'),
    }
    expect(activityRowSchema.parse(row)).toEqual(row)
    expect(
      activityRowSchema.safeParse({
        ...row,
        createdAt: row.createdAt.toISOString(),
      }).success,
    ).toBe(false)
  })
})
