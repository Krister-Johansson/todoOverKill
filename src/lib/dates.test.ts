import { describe, expect, it } from 'vitest'

import {
  dueFilterRange,
  formatDateTime,
  formatDueDate,
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
