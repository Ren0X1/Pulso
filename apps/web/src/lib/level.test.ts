import { describe, expect, it } from 'vitest'
import { levelFor } from './level.ts'

describe('levelFor', () => {
  it('nivel 1 al empezar; sube con las horas jugadas desde Pulso', () => {
    expect(levelFor(0)).toEqual({ level: 1, progress: 0, hoursToNext: 2 })
    expect(levelFor(60).level).toBe(1)
    expect(levelFor(120).level).toBe(2)
    expect(levelFor(32 * 60).level).toBe(5)
    expect(levelFor(162 * 60).level).toBe(10)
  })

  it('el progreso va de 0 a 1 dentro del nivel', () => {
    const mid = levelFor(5 * 60) // nivel 2: de 2 h a 8 h
    expect(mid.level).toBe(2)
    expect(mid.progress).toBeCloseTo(0.5)
    expect(mid.hoursToNext).toBe(3)
  })
})
