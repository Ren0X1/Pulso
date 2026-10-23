import { describe, expect, it } from 'vitest'
import { compareLibraries, feedText, notificationText } from './social.ts'

describe('notificationText', () => {
  it('solicitud de amistad', () => {
    expect(notificationText({ kind: 'friend_request', payload: { username: 'alpha' } })).toEqual({
      text: 'alpha te ha enviado una solicitud de amistad',
      href: '/amigos',
    })
  })

  it('solicitud aceptada', () => {
    expect(notificationText({ kind: 'friend_accepted', payload: { username: 'bravo' } })).toEqual({
      text: 'bravo ha aceptado tu solicitud de amistad',
      href: '/u/bravo',
    })
  })

  it('invitación a una lista, con el permiso', () => {
    expect(
      notificationText({ kind: 'list_invite', payload: { username: 'alpha', list_id: 'L1', list_name: 'Pendientes', role: 'editor' } }),
    ).toEqual({ text: 'alpha te ha invitado a «Pendientes» (puedes editarla)', href: '/listas/L1' })
    expect(
      notificationText({ kind: 'list_invite', payload: { username: 'alpha', list_id: 'L1', list_name: 'Pendientes', role: 'viewer' } }).text,
    ).toBe('alpha te ha invitado a «Pendientes» (puedes verla)')
  })

  it('un tipo desconocido no rompe nada', () => {
    expect(notificationText({ kind: 'otra_cosa', payload: {} })).toEqual({ text: 'Tienes una notificación nueva', href: '/' })
  })
})

describe('feedText', () => {
  it('partida jugada con su duración', () => {
    expect(feedText({ kind: 'played', payload: { minutes: 95 } }, 'Half-Life')).toBe('ha jugado a Half-Life · 1 h 35 min')
  })

  it('platino nuevo', () => {
    expect(feedText({ kind: 'platinum', payload: { achievements: 42 } }, 'Elden Ring')).toBe('ha conseguido el platino de Elden Ring (42 logros)')
  })
})

describe('compareLibraries', () => {
  const mine = [
    { game_id: 1, playtime_minutes: 600 },
    { game_id: 2, playtime_minutes: 30 },
    { game_id: 3, playtime_minutes: null },
  ]
  const theirs = [
    { game_id: 2, playtime_minutes: 900 },
    { game_id: 3, playtime_minutes: 10 },
    { game_id: 4, playtime_minutes: 5 },
  ]
  const myProgress = [{ game_id: 2, unlocked: 10, total: 10 }]
  const theirProgress = [{ game_id: 2, unlocked: 4, total: 10 }]

  it('juegos en común con las horas y los logros de cada uno', () => {
    const result = compareLibraries(mine, theirs, myProgress, theirProgress)
    expect(result.onlyMine).toBe(1)
    expect(result.onlyTheirs).toBe(1)
    expect(result.common).toEqual([
      { game_id: 2, mine: { minutes: 30, unlocked: 10, total: 10 }, theirs: { minutes: 900, unlocked: 4, total: 10 } },
      { game_id: 3, mine: { minutes: null, unlocked: null, total: null }, theirs: { minutes: 10, unlocked: null, total: null } },
    ])
  })

  it('ordena los comunes por horas totales de los dos', () => {
    const result = compareLibraries(mine, theirs, [], [])
    expect(result.common.map((c) => c.game_id)).toEqual([2, 3])
  })
})
