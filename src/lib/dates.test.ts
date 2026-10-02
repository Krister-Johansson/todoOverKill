import { describe, expect, it } from 'vitest'

import {
  dueDateInputHint,
  dueFilterRange,
  formatDateTime,
  formatDueDate,
  formatRelativeTime,
  isPastDay,
  toCalendarDay,
} from './dates'

describe('toCalendarDay', () => {
  it('gives the local day on either side of midnight', () => {
    expect(toCalendarDay(new Date(2026, 8, 30, 23, 59, 59))).toBe('2026-09-30')
    expect(toCalendarDay(new Date(2026, 9, 1, 0, 0, 0))).toBe('2026-10-01')
  })

  it('pads the month and day', () => {
    expect(toCalendarDay(new Date(2026, 0, 5, 12))).toBe('2026-01-05')
  })
})

describe('formatDueDate', () => {
  it('prints the day itself, whatever the zone', () => {
    expect(formatDueDate('2026-10-01')).toBe('Oct 1, 2026')
    expect(formatDueDate('2000-01-01')).toBe('Jan 1, 2000')
  })
})

describe('formatDateTime', () => {
  it('prints the local date and time', () => {
    expect(formatDateTime(new Date(2026, 9, 1, 14, 5))).toMatch(
      /^Oct 1, 2026, 2:05\sPM$/,
    )
  })
})

describe('isPastDay', () => {
  it('is true only for a day before today', () => {
    expect(isPastDay('2026-09-30', '2026-10-01')).toBe(true)
    expect(isPastDay('2026-10-01', '2026-10-01')).toBe(false)
    expect(isPastDay('2026-10-02', '2026-10-01')).toBe(false)
  })
})

describe('dueFilterRange', () => {
  it('ends overdue the day before today and leaves out completed tasks', () => {
    expect(dueFilterRange('overdue', '2026-10-15')).toEqual({
      dueTo: '2026-10-14',
      completed: false,
    })
  })

  it('makes today a range of one day', () => {
    expect(dueFilterRange('today', '2026-10-15')).toEqual({
      dueFrom: '2026-10-15',
      dueTo: '2026-10-15',
    })
  })

  it('makes week today and the six days after it', () => {
    expect(dueFilterRange('week', '2026-10-15')).toEqual({
      dueFrom: '2026-10-15',
      dueTo: '2026-10-21',
    })
  })

  it('crosses a month and a year boundary', () => {
    expect(dueFilterRange('overdue', '2026-10-01').dueTo).toBe('2026-09-30')
    expect(dueFilterRange('week', '2026-12-29').dueTo).toBe('2027-01-04')
  })
})

describe('formatRelativeTime', () => {
  const now = new Date('2026-10-01T12:00:00.000Z')
  const ago = (ms: number) =>
    formatRelativeTime(new Date(now.getTime() - ms), now)
  const second = 1000
  const minute = 60 * second
  const hour = 60 * minute
  const day = 24 * hour

  it('says just now under a minute', () => {
    expect(ago(0)).toBe('just now')
    expect(ago(59 * second)).toBe('just now')
  })

  it('says just now for a moment after now', () => {
    expect(ago(-5 * second)).toBe('just now')
    expect(ago(-3 * day)).toBe('just now')
  })

  it('counts minutes, hours and days in whole units', () => {
    expect(ago(minute)).toBe('1 minute ago')
    expect(ago(59 * minute + 59 * second)).toBe('59 minutes ago')
    expect(ago(hour)).toBe('1 hour ago')
    expect(ago(2 * hour + 30 * minute)).toBe('2 hours ago')
    expect(ago(23 * hour + 59 * minute)).toBe('23 hours ago')
    expect(ago(day)).toBe('1 day ago')
    expect(ago(6 * day)).toBe('6 days ago')
  })

  it('counts weeks, months and years', () => {
    expect(ago(7 * day)).toBe('1 week ago')
    expect(ago(29 * day)).toBe('4 weeks ago')
    expect(ago(30 * day)).toBe('1 month ago')
    expect(ago(364 * day)).toBe('12 months ago')
    expect(ago(365 * day)).toBe('1 year ago')
    expect(ago(3 * 365 * day)).toBe('3 years ago')
  })

  it('never uses a calendar word that could contradict the date', () => {
    // Monday 23:00 seen on Wednesday 00:30 is 25.5 hours earlier: one
    // elapsed day, though the calendar says two days back.
    const seen = new Date(2026, 8, 30, 0, 30)
    const event = new Date(2026, 8, 28, 23, 0)
    expect(formatRelativeTime(event, seen)).toBe('1 day ago')
    expect(formatRelativeTime(event, seen)).not.toMatch(/yesterday/)
  })
})

describe('dueDateInputHint', () => {
  it.each([
    ['en-US', 'month, day and year', '10/01/2026'],
    ['en-GB', 'day, month and year', '01/10/2026'],
    ['sv-SE', 'year, month and day', '2026-10-01'],
  ])('names the order and an example for %s', (locale, order, example) => {
    expect(dueDateInputHint(locale)).toEqual({ order, example })
  })
})
