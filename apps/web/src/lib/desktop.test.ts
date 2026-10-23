import { describe, expect, it } from 'vitest'
import { formatBytes, sessionMinutes, steamAppId } from './desktop.ts'

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
