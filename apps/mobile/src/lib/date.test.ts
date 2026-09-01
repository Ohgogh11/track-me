import { describe, expect, test } from 'bun:test'
import { dateRangeForDays, localDateToday } from './date'

describe('mobile date helpers', () => {
  test('builds an inclusive local range', () => {
    const range = dateRangeForDays(7)
    expect(Date.parse(range.to)).toBeGreaterThan(Date.parse(range.from))
    expect(new Date(range.from).getHours()).toBe(0)
    expect(new Date(range.to).getHours()).toBe(23)
  })

  test('uses the sortable local date format', () => {
    expect(localDateToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
