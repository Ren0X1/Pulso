import { describe, expect, it } from 'vitest'
import { AdminError, adminErrorMessage, runLabel, type AdminRun } from './admin.ts'

const NOW = new Date('2026-11-02T12:00:00Z')
const run = (extra: Partial<AdminRun>): AdminRun => ({
  id: 1,
  user_id: 'u1',
  status: 'running',
  error: null,
  started_at: '2026-11-02T11:55:00Z',
  finished_at: null,
  updated_at: '2026-11-02T11:59:50Z',
  games: 385,
  added: 0,
  total: 300,
  checked: 90,
  unlocked: 12000,
  hidden_games: 0,
  skipped_games: 0,
  forced_by: null,
  ...extra,
})

describe('runLabel', () => {
  it('cuenta en qué va cada sincronización', () => {
    expect(runLabel(null, NOW)).toBe('Nunca')
    expect(runLabel(run({ games: null, total: null }), NOW)).toBe('Importando biblioteca · empezó hace 5 min')
    expect(runLabel(run({}), NOW)).toBe(`Logros 90 de 300 juegos · ${(12000).toLocaleString('es')} conseguidos`)
    expect(runLabel(run({ status: 'ok', finished_at: '2026-11-02T09:00:00Z', checked: 300 }), NOW)).toBe(
      'Bien hace 3 h · 300 juegos revisados',
    )
    expect(runLabel(run({ status: 'ok', finished_at: '2026-11-02T09:00:00Z', hidden_games: 12 }), NOW)).toMatch(/ · 12 ocultos en Steam$/)
    expect(runLabel(run({ status: 'error', error: 'achievements_private' }), NOW)).toBe(
      'Falló hace 5 min · Steam no comparte tus logros: pon "Detalles de juego" en Público (no "Solo amigos") en la privacidad de tu perfil de Steam',
    )
  })
})

describe('adminErrorMessage', () => {
  it('explica los errores del panel', () => {
    expect(adminErrorMessage(new AdminError('forbidden'))).toMatch(/Ya no tienes acceso/)
    expect(adminErrorMessage(new AdminError('cannot_revoke_self'))).toMatch(/a ti mismo/)
    expect(adminErrorMessage(new Error('x'))).toMatch(/No se pudo/)
  })
})
