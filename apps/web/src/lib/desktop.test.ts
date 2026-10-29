import { describe, expect, it } from 'vitest'
import { formatBytes, presenceLine, sessionMinutes, steamAppId } from './desktop.ts'

describe('presenceLine', () => {
  it('logros del juego y horas de Steam', () => {
    expect(presenceLine({ minutes: 7230, unlocked: 34, total: 50 })).toBe('34/50 logros · 120 h de juego')
  })

  it('con todos los logros dice platino', () => {
    expect(presenceLine({ minutes: 600, unlocked: 50, total: 50 })).toBe('🏆 Platino · 10 h de juego')
  })

  it('sin logros ni una hora jugada no hay línea (Discord pone "Jugando con Pulso")', () => {
    expect(presenceLine({ minutes: 30, unlocked: 0, total: 0 })).toBeNull()
    expect(presenceLine({ minutes: 90, unlocked: 0, total: 0 })).toBe('1 h de juego')
  })
})

describe('steamAppId', () => {
  it('saca el AppID de Steam de los ids externos del juego', () => {
    expect(steamAppId([{ source: 'igdb', external_id: '119133' }, { source: 'steam', external_id: '1245620' }])).toBe(1245620)
  })

  it('un juego que no es de Steam no tiene AppID', () => {
    expect(steamAppId([{ source: 'igdb', external_id: '1' }])).toBeNull()
    expect(steamAppId(undefined)).toBeNull()
  })
})

describe('formatBytes', () => {
  it('muestra el tamaño en disco legible', () => {
    expect(formatBytes(338_920_007)).toBe('323,2 MB')
    expect(formatBytes(73_918_888_730)).toBe('68,8 GB')
    expect(formatBytes(0)).toBe('—')
  })
})

describe('sessionMinutes', () => {
  it('redondea la sesión a minutos', () => {
    expect(sessionMinutes(0, 25 * 60_000 + 40_000)).toBe(26)
  })

  it('una sesión de menos de un minuto no cuenta', () => {
    expect(sessionMinutes(0, 45_000)).toBe(0)
  })
})
