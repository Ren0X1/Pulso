import { describe, expect, it } from 'vitest'
import { formatAgo, isStalled, rarityLabel, syncErrorMessage, syncProgressText, syncSummaryText } from './steam.ts'

describe('progreso de la sincronización', () => {
  it('primero la biblioteca, luego los logros juego a juego', () => {
    expect(syncProgressText({ games: null, total: null, checked: 0 })).toBe('Importando tu biblioteca y tus horas…')
    expect(syncProgressText({ games: 385, total: 300, checked: 90 })).toBe('Revisando logros: 90 de 300 juegos…')
  })

  it('resume una sincronización terminada', () => {
    expect(syncSummaryText({ games: 385, added: 3, checked: 300, unlocked: 40123 })).toBe(
      '385 juegos en Steam · 3 nuevos en tu biblioteca · logros revisados en 300 juegos (40123 conseguidos)',
    )
  })

  it('una sincronización en marcha que lleva 90 s sin avanzar está atascada (la web relanza la tanda)', () => {
    const now = new Date('2026-11-02T12:00:00Z')
    expect(isStalled({ status: 'running', updated_at: '2026-11-02T11:59:00Z' }, now)).toBe(false)
    expect(isStalled({ status: 'running', updated_at: '2026-11-02T11:58:00Z' }, now)).toBe(true)
    expect(isStalled({ status: 'ok', updated_at: '2026-11-02T10:00:00Z' }, now)).toBe(false)
  })
})

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

describe('syncErrorMessage: logros y paradas', () => {
  it('explica los logros privados y las sincronizaciones paradas', () => {
    expect(syncErrorMessage({ error: 'achievements_private' })).toMatch(/Detalles de juego.*Público/)
    expect(syncErrorMessage({ error: 'cancelled' })).toMatch(/administrador/)
    expect(syncErrorMessage({ error: 'interrupted' })).toMatch(/a medias/)
  })
})
