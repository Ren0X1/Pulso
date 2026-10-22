import { describe, expect, it } from 'vitest'
import { suggestUsername } from './username.ts'
import { usernameSchema } from './schemas.ts'

const STEAM_ID = '76561198012345678'
const free = () => false

describe('suggestUsername', () => {
  it('limpia emojis, espacios y mayúsculas', () => {
    expect(suggestUsername('Ren0X1 🔥', STEAM_ID, free)).toBe('ren0x1')
  })

  it('quita acentos en lugar de cambiarlos por guiones bajos', () => {
    expect(suggestUsername('Señor Óscar', STEAM_ID, free)).toBe('senor_oscar')
  })

  it('completa los nombres demasiado cortos con el final del SteamID', () => {
    const name = suggestUsername('A', STEAM_ID, free)
    expect(name.startsWith('a')).toBe(true)
    expect(usernameSchema.safeParse(name).success).toBe(true)
  })

  it('usa player_ + SteamID si el nombre no tiene nada aprovechable', () => {
    expect(suggestUsername('🔥🔥🔥', STEAM_ID, free)).toBe('player_345678')
  })

  it('añade un sufijo cuando el nombre está ocupado', () => {
    const taken = new Set(['ren0x1'])
    expect(suggestUsername('Ren0X1', STEAM_ID, (u) => taken.has(u))).toBe('ren0x1_2')
  })

  it('sigue probando sufijos hasta encontrar uno libre', () => {
    const taken = new Set(['ren0x1', 'ren0x1_2', 'ren0x1_3'])
    expect(suggestUsername('Ren0X1', STEAM_ID, (u) => taken.has(u))).toBe('ren0x1_4')
  })

  it('no pasa de 20 caracteres, tampoco con sufijo', () => {
    const long = 'x'.repeat(40)
    expect(suggestUsername(long, STEAM_ID, free).length).toBeLessThanOrEqual(20)
    const taken = new Set(['x'.repeat(20)])
    const name = suggestUsername(long, STEAM_ID, (u) => taken.has(u))
    expect(name).toBe('x'.repeat(18) + '_2')
  })

  it('siempre devuelve un username válido', () => {
    for (const persona of ['', ' ', '__', 'a_', '日本語', 'Ab-Cd.Ef', 'ÆØÅ', 'x'.repeat(25) + ' y']) {
      const name = suggestUsername(persona, STEAM_ID, free)
      expect(usernameSchema.safeParse(name).success, `${persona} → ${name}`).toBe(true)
    }
  })
})

describe('usernameSchema', () => {
  it('acepta 3–20 caracteres de [a-z0-9_]', () => {
    expect(usernameSchema.safeParse('abc').success).toBe(true)
    expect(usernameSchema.safeParse('a'.repeat(20)).success).toBe(true)
  })

  it('rechaza mayúsculas, longitudes fuera de rango y símbolos', () => {
    for (const bad of ['ab', 'a'.repeat(21), 'Ren0X1', 'ren-0x1', 'ren 0x1']) {
      expect(usernameSchema.safeParse(bad).success, bad).toBe(false)
    }
  })
})
