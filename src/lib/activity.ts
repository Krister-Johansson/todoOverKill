import { activityPayloadSchemas, activityTypeSchema } from '#/schemas/activity'

import type * as z from 'zod'
import type { ActivityRow, ActivityTypeName } from '#/schemas/activity'

type Payload<T extends ActivityTypeName> = z.infer<
  (typeof activityPayloadSchemas)[T]
>

/** The words for each field a task.updated row can name. */
export const FIELD_WORDS: Record<string, string> = {
  title: 'the title',
  description: 'the description',
  priority: 'the priority',
  dueDate: 'the due date',
  labels: 'the labels',
}

/** The words for each field a subtask.updated row can name. */
export const SUBTASK_FIELD_WORDS: Record<string, string> = {
  title: 'the title',
  done: 'the done state',
}

const fieldList = new Intl.ListFormat('en', {
  style: 'long',
  type: 'conjunction',
})

/** User text in curly quotes, so a title reads apart from the sentence. */
function quote(text: string) {
  return `“${text}”`
}

const SENTENCES: { [T in ActivityTypeName]: (payload: Payload<T>) => string } =
  {
    'project.created': ({ name }) => `Created the project ${quote(name)}.`,
    'project.archived': ({ name }) => `Archived the project ${quote(name)}.`,
    'task.created': ({ title }) => `Created the task ${quote(title)}.`,
    // A field without a word, written by a newer service, shows its own name
    // rather than dropping the whole sentence.
    'task.updated': ({ fields }) =>
      `Changed ${fieldList.format(fields.map((field) => FIELD_WORDS[field] ?? field))}.`,
    // The payload holds status names, not ids, so a reorder is told apart by
    // name: a move between two statuses that share a name reads as one.
    'task.moved': ({ from, to }) =>
      from === to
        ? `Reordered within ${from}.`
        : `Moved from ${from} to ${to}.`,
    'task.completed': () => 'Completed the task.',
    'task.deleted': ({ title }) => `Deleted the task ${quote(title)}.`,
    'comment.added': () => 'Added a comment.',
    'subtask.added': ({ title }) => `Added the subtask ${quote(title)}.`,
    // The title is the one the subtask has after the change. A row without
    // `done` names the fields only.
    'subtask.updated': ({ title, fields, done }) =>
      done !== undefined &&
      fields.length === 2 &&
      fields.includes('title') &&
      fields.includes('done')
        ? `Renamed and ${done ? 'completed' : 'reopened'} the subtask ${quote(title)}.`
        : `Changed ${fieldList.format(fields.map((field) => SUBTASK_FIELD_WORDS[field] ?? field))} of the subtask ${quote(title)}.`,
    'subtask.completed': ({ title }) =>
      `Completed the subtask ${quote(title)}.`,
    'subtask.reopened': ({ title }) => `Reopened the subtask ${quote(title)}.`,
    // The payload holds indexes from 0; the sentence counts from 1.
    'subtask.moved': ({ title, from, to }) =>
      `Moved the subtask ${quote(title)} from position ${from + 1} to ${to + 1}.`,
    'subtask.deleted': ({ title }) => `Deleted the subtask ${quote(title)}.`,
  }

function sentenceFor<T extends ActivityTypeName>(type: T, payload: unknown) {
  const parsed = activityPayloadSchemas[type].safeParse(payload)
  if (!parsed.success) return null
  return (SENTENCES[type] as (payload: Payload<T>) => string)(
    parsed.data as Payload<T>,
  )
}

/** The sentence shown when a row's type is unknown or its payload malformed. */
export function fallbackSentence(type: string) {
  return `Recorded the event ${quote(type)}.`
}

/**
 * One activity row as a sentence, such as "Moved from Backlog to In
 * progress.". A type this file does not know, or a payload that does not
 * match its type, gives the fallback sentence instead of an error.
 */
export function describeActivity(row: Pick<ActivityRow, 'type' | 'payload'>) {
  const type = activityTypeSchema.safeParse(row.type)
  if (!type.success) return fallbackSentence(row.type)
  return sentenceFor(type.data, row.payload) ?? fallbackSentence(row.type)
}
