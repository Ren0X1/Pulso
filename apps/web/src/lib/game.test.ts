import { describe, expect, it } from 'vitest'
import { latestUnlocked, missingAchievements } from './game.ts'
import type { GameAchievement } from './achievements.ts'

const a = (id: number, percent: number | null, unlocked_at: string | null | undefined): GameAchievement => ({
  id, name: `L${id}`, description: null, icon_url: null, icon_locked_url: null, hidden: false, global_percent: percent, unlocked_at,
})

describe('missingAchievements', () => {
  it('los que faltan, del más raro al más común', () => {
    const list = [a(1, 50, undefined), a(2, 2, undefined), a(3, 1, '2026-01-01T00:00:00Z'), a(4, null, undefined)]
    expect(missingAchievements(list).map((x) => x.id)).toEqual([2, 1, 4])
  })
})

describe('latestUnlocked', () => {
  it('los últimos conseguidos primero; sin fecha no cuentan', () => {
    const list = [a(1, 10, '2026-01-01T00:00:00Z'), a(2, 10, '2026-03-01T00:00:00Z'), a(3, 10, null), a(4, 10, undefined)]
    expect(latestUnlocked(list).map((x) => x.id)).toEqual([2, 1])
  })
})
