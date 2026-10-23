import { describe, expect, it } from 'vitest'
import { platinumGameIds } from './achievements.ts'

describe('platinumGameIds', () => {
  it('platino = todos los logros del juego conseguidos', () => {
    const ids = platinumGameIds([
      { game_id: 1, unlocked: 42, total: 42 },
      { game_id: 2, unlocked: 41, total: 42 },
      { game_id: 3, unlocked: 709, total: 709 },
    ])
    expect([...ids].sort()).toEqual([1, 3])
  })

  it('un juego sin logros nunca es platino', () => {
    expect(platinumGameIds([{ game_id: 1, unlocked: 0, total: 0 }]).size).toBe(0)
  })
})
