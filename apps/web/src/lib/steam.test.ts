import { describe, expect, it, vi } from 'vitest'
import { formatAgo, rarityLabel, syncErrorMessage, syncSteam, type SyncResult } from './steam.ts'

describe('syncSteam', () => {
  const tanda = (extra: Partial<SyncResult>): SyncResult => ({
    run: 'r1', games: 382, added: 0, achievementGames: 70, checked: 0, remaining: 0, unlocked: 0, ...extra,
  })

  it('pide tandas hasta revisar todos los juegos, continuando la misma sincronización', async () => {
    const batch = vi
      .fn()
      .mockResolvedValueOnce(tanda({ added: 5, checked: 30, remaining: 40, unlocked: 100 }))
      .mockResolvedValueOnce(tanda({ added: 0, checked: 60, remaining: 10, unlocked: 50 }))
      .mockResolvedValueOnce(tanda({ added: 0, checked: 70, remaining: 0, unlocked: 7 }))
    const progress: number[] = []
    const res = await syncSteam((p) => progress.push(p.checked), batch)
    expect(batch.mock.calls.map((c) => c[0])).toEqual([undefined, 'r1', 'r1'])
    expect(progress).toEqual([30, 60, 70])
    expect(res).toEqual(tanda({ added: 5, checked: 70, remaining: 0, unlocked: 157 }))
  })

  it('si una tanda falla, para y devuelve el error', async () => {
    const batch = vi.fn().mockResolvedValueOnce(tanda({ checked: 30, remaining: 40 })).mockResolvedValueOnce({ error: 'steam_unavailable' })
    expect(await syncSteam(undefined, batch)).toEqual({ error: 'steam_unavailable' })
    expect(batch).toHaveBeenCalledTimes(2)
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
