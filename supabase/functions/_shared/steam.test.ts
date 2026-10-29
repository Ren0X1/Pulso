import { describe, expect, it } from 'vitest'
import {
  achievementIconUrl,
  becamePlatinum,
  canContinueRun,
  hasUnknownAchievements,
  initialStatus,
  mapSchema,
  mapUnlocked,
  nextAchievementBatch,
  parseOwnedGames,
  pickAchievementGames,
  steamCoverUrl,
  syncCooldown,
  type OwnedGame,
} from './steam.ts'

const NOW = new Date('2026-10-23T12:00:00Z')
const game = (appid: number, extra: Partial<OwnedGame> = {}): OwnedGame => ({
  appid,
  name: `Juego ${appid}`,
  playtime_forever: 0,
  has_community_visible_stats: true,
  ...extra,
})

describe('steamCoverUrl', () => {
  it('usa la portada vertical oficial de la CDN de Steam', () => {
    expect(steamCoverUrl(220)).toBe('https://cdn.cloudflare.steamstatic.com/steam/apps/220/library_600x900.jpg')
  })
})

describe('parseOwnedGames', () => {
  it('lee los juegos', () => {
    const res = parseOwnedGames({ response: { game_count: 1, games: [game(220, { playtime_forever: 90 })] } })
    expect(res).toEqual({ ok: true, games: [game(220, { playtime_forever: 90 })] })
  })

  it('una respuesta vacía significa detalles de juego privados', () => {
    expect(parseOwnedGames({ response: {} })).toEqual({ ok: false, error: 'games_private' })
  })

  it('cero juegos es una biblioteca vacía de verdad', () => {
    expect(parseOwnedGames({ response: { game_count: 0 } })).toEqual({ ok: true, games: [] })
  })

  it('una respuesta rota no se toma por vacía', () => {
    expect(parseOwnedGames(null)).toEqual({ ok: false, error: 'steam_unavailable' })
    expect(parseOwnedGames({ nada: 1 })).toEqual({ ok: false, error: 'steam_unavailable' })
  })
})

describe('syncCooldown', () => {
  it('sin sincronizaciones previas se puede ya', () => {
    expect(syncCooldown(null, NOW)).toBe(0)
  })

  it('dentro de los 10 minutos devuelve los segundos que faltan', () => {
    expect(syncCooldown(new Date('2026-10-23T11:57:00Z'), NOW)).toBe(420)
  })

  it('pasados los 10 minutos se puede', () => {
    expect(syncCooldown(new Date('2026-10-23T11:40:00Z'), NOW)).toBe(0)
  })
})

describe('initialStatus', () => {
  const twoWeeksAgo = NOW.getTime() / 1000 - 14 * 86400
  it('jugado en las últimas 2 semanas → jugando', () => {
    expect(initialStatus(game(1, { playtime_2weeks: 30, rtime_last_played: twoWeeksAgo + 3600 }), NOW)).toBe('playing')
  })

  it('el resto → pendiente', () => {
    expect(initialStatus(game(1, { playtime_forever: 5000, rtime_last_played: twoWeeksAgo - 3600 }), NOW)).toBe('backlog')
    expect(initialStatus(game(1), NOW)).toBe('backlog')
  })
})

describe('pickAchievementGames', () => {
  it('solo juegos con logros; primero los recientes, luego los nunca sincronizados, luego por horas', () => {
    const owned = [
      game(1, { playtime_forever: 9000 }),
      game(2, { playtime_forever: 10, playtime_2weeks: 10 }),
      game(3, { playtime_forever: 500 }),
      game(4, { playtime_forever: 99999, has_community_visible_stats: false }),
      game(5, { playtime_forever: 20000 }),
    ]
    const synced = new Map([[5, new Date('2026-10-20T00:00:00Z')]])
    expect(pickAchievementGames(owned, synced, 10).map((g) => g.appid)).toEqual([2, 1, 3, 5])
  })

  it('respeta el límite', () => {
    const owned = Array.from({ length: 40 }, (_, i) => game(i + 1, { playtime_forever: i }))
    expect(pickAchievementGames(owned, new Map(), 25)).toHaveLength(25)
  })
})

describe('mapSchema', () => {
  it('convierte el esquema y el porcentaje global (que llega como texto)', () => {
    const schema = {
      game: {
        availableGameStats: {
          achievements: [
            { name: 'WIN', displayName: 'Ganar', description: 'Gana', hidden: 0, icon: 'https://i/a.jpg', icongray: 'https://i/a_bw.jpg' },
            { name: 'SECRET', displayName: 'Secreto', hidden: 1, icon: 'https://i/s.jpg', icongray: 'https://i/s_bw.jpg' },
          ],
        },
      },
    }
    const global = { achievementpercentages: { achievements: [{ name: 'WIN', percent: '80.9' }] } }
    expect(mapSchema(7, schema, global)).toEqual([
      { game_id: 7, source: 'steam', api_name: 'WIN', name: 'Ganar', description: 'Gana', icon_url: 'https://i/a.jpg', icon_locked_url: 'https://i/a_bw.jpg', hidden: false, global_percent: 80.9 },
      { game_id: 7, source: 'steam', api_name: 'SECRET', name: 'Secreto', description: null, icon_url: 'https://i/s.jpg', icon_locked_url: 'https://i/s_bw.jpg', hidden: true, global_percent: null },
    ])
  })

  it('un juego sin logros da lista vacía', () => {
    expect(mapSchema(7, { game: {} }, null)).toEqual([])
  })
})

describe('mapUnlocked', () => {
  const ids = new Map([['WIN', 11], ['LOSE', 12], ['OLD', 13]])
  it('solo los conseguidos; unlocktime 0 se guarda como fecha desconocida, no como 1970', () => {
    const player = {
      playerstats: {
        success: true,
        achievements: [
          { apiname: 'WIN', achieved: 1, unlocktime: 1698312428 },
          { apiname: 'LOSE', achieved: 0, unlocktime: 0 },
          { apiname: 'OLD', achieved: 1, unlocktime: 0 },
          { apiname: 'DESCONOCIDO', achieved: 1, unlocktime: 1 },
        ],
      },
    }
    expect(mapUnlocked('u1', player, ids)).toEqual([
      { user_id: 'u1', achievement_id: 11, unlocked_at: '2023-10-26T09:27:08.000Z' },
      { user_id: 'u1', achievement_id: 13, unlocked_at: null },
    ])
  })

  it('si Steam no da los logros del jugador, ninguno', () => {
    expect(mapUnlocked('u1', { playerstats: { success: false } }, ids)).toEqual([])
  })
})

describe('achievementIconUrl', () => {
  it('pasa las direcciones antiguas de Steam a la CDN que sirve todos los iconos', () => {
    expect(
      achievementIconUrl('https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/252490/861b.jpg'),
    ).toBe('https://shared.fastly.steamstatic.com/community_assets/images/apps/252490/861b.jpg')
  })

  it('deja igual lo que ya está bien o no reconoce', () => {
    const ok = 'https://shared.fastly.steamstatic.com/community_assets/images/apps/1/a.jpg'
    expect(achievementIconUrl(ok)).toBe(ok)
    expect(achievementIconUrl('')).toBeNull()
  })
})

describe('becamePlatinum', () => {
  it('solo cuando esta sincronización completa el juego', () => {
    expect(becamePlatinum(41, 42, 42)).toBe(true)
    expect(becamePlatinum(42, 42, 42)).toBe(false)
    expect(becamePlatinum(0, 41, 42)).toBe(false)
    expect(becamePlatinum(0, 0, 0)).toBe(false)
  })
})

describe('nextAchievementBatch', () => {
  const START = new Date('2026-10-29T10:00:00Z')

  it('una sincronización acaba revisando todos los juegos con logros, tanda a tanda', () => {
    const owned = [...Array.from({ length: 70 }, (_, i) => game(i + 1)), game(999, { has_community_visible_stats: false })]
    const synced = new Map<number, Date | null>()
    const seen = new Set<number>()
    let remaining = Infinity
    for (let calls = 0; remaining > 0; calls++) {
      expect(calls).toBeLessThan(10)
      const next = nextAchievementBatch(owned, synced, START, 30)
      expect(next.total).toBe(70)
      for (const g of next.batch) {
        seen.add(g.appid)
        synced.set(g.appid, new Date(START.getTime() + 60_000))
      }
      remaining = next.remaining
    }
    expect(seen.size).toBe(70)
    expect(seen.has(999)).toBe(false) // sin logros en Steam: no hay nada que revisar
  })

  it('los revisados antes de empezar esta sincronización se vuelven a revisar', () => {
    const synced = new Map([[1, new Date('2026-10-28T10:00:00Z')], [2, new Date('2026-10-29T10:05:00Z')]])
    const next = nextAchievementBatch([game(1), game(2)], synced, START)
    expect(next.batch.map((g) => g.appid)).toEqual([1])
    expect(next.remaining).toBe(0)
  })
})

describe('canContinueRun', () => {
  const now = new Date('2026-10-29T10:10:00Z')
  const run = { user_id: 'u1', status: 'running', started_at: '2026-10-29T10:00:00Z' }

  it('la del propio usuario, en marcha y reciente', () => {
    expect(canContinueRun(run, 'u1', now)).toBe(true)
  })

  it('no la de otro, ni una terminada, ni una abandonada hace más de 30 min', () => {
    expect(canContinueRun(run, 'u2', now)).toBe(false)
    expect(canContinueRun({ ...run, status: 'ok' }, 'u1', now)).toBe(false)
    expect(canContinueRun(run, 'u1', new Date('2026-10-29T10:31:00Z'))).toBe(false)
    expect(canContinueRun(null, 'u1', now)).toBe(false)
  })
})

describe('hasUnknownAchievements', () => {
  it('detecta logros nuevos del juego que Pulso aún no tiene', () => {
    const player = { playerstats: { achievements: [{ apiname: 'A' }, { apiname: 'DLC_1' }] } }
    expect(hasUnknownAchievements(player, new Set(['A']))).toBe(true)
    expect(hasUnknownAchievements(player, new Set(['A', 'DLC_1']))).toBe(false)
    expect(hasUnknownAchievements(null, new Set())).toBe(false)
  })
})
