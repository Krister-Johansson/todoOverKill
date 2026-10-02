/**
 * Calendar days as `YYYY-MM-DD` strings, the form the task schemas use. A day
 * has no time or zone, so these helpers never go through the local zone except
 * to read today's date.
 */

import type { DueFilter, ListTasksInput } from '#/schemas/task'

/** The local calendar day of `now`, as `YYYY-MM-DD`. */
export function toCalendarDay(now: Date) {
  const year = String(now.getFullYear()).padStart(4, '0')
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Formatted in UTC from UTC midnight, so the day never shifts and the server
// and the browser print the same text.
const dueDateFormat = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeZone: 'UTC',
})

/** A day such as `2026-10-01` as `Oct 1, 2026`. */
export function formatDueDate(day: string) {
  return dueDateFormat.format(new Date(`${day}T00:00:00Z`))
}

const HINT_DAY = new Date('2026-10-01T00:00:00Z')

const PART_WORDS: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {
  year: 'year',
  month: 'month',
  day: 'day',
}

// The order matches the example, which is the value the field holds.
const FALLBACK_HINT = { order: 'year, month and day', example: '2026-10-01' }

function hintFormat(locale?: string) {
  try {
    // The native field shows Gregorian dates in Latin digits whatever the
    // locale's own calendar and numbers, such as th-TH's Buddhist years.
    return new Intl.DateTimeFormat(locale, {
      calendar: 'gregory',
      numberingSystem: 'latn',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: 'UTC',
    })
  } catch {
    // A malformed locale tag throws a RangeError.
    return undefined
  }
}

/**
 * How a native date input shows a day in `locale`: its parts in order, such
 * as `month, day and year`, and 2026-10-01 written that way, such as
 * `10/01/2026` in en-US. Chrome draws the field from the locale, so help text
 * built from this matches what the user sees (3.3.2). A locale whose format
 * does not give exactly a year, a month and a day gets fixed wording with the
 * ISO date instead.
 */
export function dueDateInputHint(locale?: string) {
  const format = hintFormat(locale)
  if (!format) return FALLBACK_HINT
  const words = format
    .formatToParts(HINT_DAY)
    .flatMap(({ type }) => PART_WORDS[type] ?? [])
  if (words.length !== 3 || new Set(words).size !== 3) return FALLBACK_HINT
  return {
    order: `${words[0]}, ${words[1]} and ${words[2]}`,
    example: format.format(HINT_DAY),
  }
}

/**
 * The error for a date input the browser cannot read, such as a month and day
 * with no year. Its value is then empty, so only `validity.badInput` shows it.
 */
export const INCOMPLETE_DUE_DATE_MESSAGE =
  'Enter the whole date, with day, month and year, or clear the field.'

// A moment, unlike a day, is shown in the local zone. The app is local, so
// the server render and the browser share that zone.
const dateTimeFormat = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

/** A moment as `Oct 1, 2026, 2:05 PM`, in the local zone. */
export function formatDateTime(moment: Date) {
  return dateTimeFormat.format(moment)
}

/** True when `day` is before `today`. Today itself is not past. */
export function isPastDay(day: string, today: string) {
  return day < today
}

/** `day` moved by `days`, worked out in UTC so no zone offset can shift it. */
function addDays(day: string, days: number) {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/**
 * The listTasks filters for a due preset, counted from `today`. Today and week
 * include both ends; week is today and the six days after it. Overdue is due
 * before today and not completed, the same rule the board card uses for its
 * Overdue mark, so a done task due yesterday is left out.
 */
export function dueFilterRange(
  due: DueFilter,
  today: string,
): Pick<ListTasksInput, 'dueFrom' | 'dueTo' | 'completed'> {
  switch (due) {
    case 'overdue':
      return { dueTo: addDays(today, -1), completed: false }
    case 'today':
      return { dueFrom: today, dueTo: today }
    case 'week':
      return { dueFrom: today, dueTo: addDays(today, 6) }
  }
}

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

// Largest first; a month is 30 days and a year 365, close enough for "ago".
const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * DAY],
  ['month', 30 * DAY],
  ['week', 7 * DAY],
  ['day', DAY],
  ['hour', HOUR],
  ['minute', MINUTE],
]

// Always a number ("1 day ago"), never a calendar word ("yesterday"): the
// count is of elapsed 24 hour or 7 day blocks, so a calendar word could
// disagree with the absolute date shown beside it.
const relativeFormat = new Intl.RelativeTimeFormat('en', { numeric: 'always' })

/**
 * How long before `now` a moment was, such as `2 hours ago` or `1 day ago`,
 * in the largest whole unit. Under a minute, and any moment after `now`, is
 * `just now`, so a row written after the page loaded never reads as future.
 */
export function formatRelativeTime(moment: Date, now: Date) {
  const elapsed = now.getTime() - moment.getTime()
  for (const [unit, size] of RELATIVE_UNITS) {
    if (elapsed >= size) {
      return relativeFormat.format(-Math.floor(elapsed / size), unit)
    }
  }
  return 'just now'
}
