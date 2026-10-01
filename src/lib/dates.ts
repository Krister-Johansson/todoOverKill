/**
 * Calendar days as `YYYY-MM-DD` strings, the form the task schemas use. A day
 * has no time or zone, so these helpers never go through the local zone except
 * to read today's date.
 */

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

/** True when `day` is before `today`. Today itself is not past. */
export function isPastDay(day: string, today: string) {
  return day < today
}
