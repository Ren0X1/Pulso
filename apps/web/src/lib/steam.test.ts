import { describe, expect, it } from 'vitest'
import { formatAgo, rarityLabel, syncErrorMessage } from './steam.ts'

const NOW = new Date('2026-10-23T12:00:00Z')

describe('formatAgo', () => {
  it('dice cuánto hace en palabras', () => {
    expect(formatAgo('2026-10-23T11:59:30Z', NOW)).toBe('hace un momento')
    expect(formatAgo('2026-10-23T11:45:00Z', NOW)).toBe('hace 15 min')
    expect(formatAgo('2026-10-23T09:00:00Z', NOW)).toBe('hace 3 h')
    expect(formatAgo('2026-10-20T12:00:00Z', NOW)).toBe('hace 3 días')
  })
})

describe('rarityLabel', () => {
  it('clasifica por el porcentaje global de jugadores que lo tienen', () => {
    expect(rarityLabel(2.5)).toBe('Ultra raro')
    expect(rarityLabel(9)).toBe('Raro')
    expect(rarityLabel(40)).toBe('Poco común')
    expect(rarityLabel(80)).toBe('Común')
    expect(rarityLabel(null)).toBeNull()
  })
})

describe('syncErrorMessage', () => {
  it('explica cada error de Steam', () => {
    expect(syncErrorMessage({ error: 'profile_private' })).toMatch(/perfil de Steam es privado/)
    expect(syncErrorMessage({ error: 'games_private' })).toMatch(/Detalles de juego/)
    expect(syncErrorMessage({ error: 'cooldown', retry_after: 420 })).toBe('Ya sincronizaste hace poco. Vuelve a intentarlo en 7 min.')
    expect(syncErrorMessage({ error: 'cosa_rara' })).toMatch(/No se pudo sincronizar/)
  })
})
