import { describe, expect, it } from 'vitest'
import { newsAgo } from './news.ts'

describe('newsAgo', () => {
  const now = Date.UTC(2026, 10, 2, 12) // 2 nov 2026
  it('dice cuánto hace que se publicó', () => {
    expect(newsAgo(now / 1000 - 600, now)).toBe('hace un momento')
    expect(newsAgo(now / 1000 - 3 * 3600, now)).toBe('hace 3 h')
    expect(newsAgo(now / 1000 - 2 * 86400, now)).toBe('hace 2 días')
    expect(newsAgo(now / 1000 - 90 * 86400, now)).toMatch(/2026/)
  })
})
