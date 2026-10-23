// Steam Web API: biblioteca, horas y logros. Sin dependencias: corre en Deno y en los tests.
// https://partner.steamgames.com/doc/webapi — 100.000 llamadas al día por clave.

export const SYNC_COOLDOWN_MINUTES = 10
export const ACHIEVEMENT_GAMES_PER_SYNC = 25
const TWO_WEEKS = 14 * 86400

export interface OwnedGame {
  appid: number
  name: string
  playtime_forever: number
  playtime_2weeks?: number
  rtime_last_played?: number
  has_community_visible_stats?: boolean
}

export type SteamSyncError = 'profile_private' | 'games_private' | 'steam_unavailable'

export function steamCoverUrl(appid: number): string {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`
}

/** Steam responde `{}` cuando los detalles de juego son privados y `{ game_count: 0 }` si no hay juegos. */
export function parseOwnedGames(
  body: unknown,
): { ok: true; games: OwnedGame[] } | { ok: false; error: SteamSyncError } {
  const response = (body as { response?: { game_count?: number; games?: OwnedGame[] } } | null)?.response
  if (!response) return { ok: false, error: 'steam_unavailable' }
  if (response.game_count === undefined) return { ok: false, error: 'games_private' }
  return { ok: true, games: response.games ?? [] }
}

/** Segundos que faltan para poder volver a sincronizar (0 = ya). */
export function syncCooldown(lastStartedAt: Date | null, now: Date): number {
  if (!lastStartedAt) return 0
  const wait = lastStartedAt.getTime() + SYNC_COOLDOWN_MINUTES * 60_000 - now.getTime()
  return wait > 0 ? Math.ceil(wait / 1000) : 0
}

export function initialStatus(game: OwnedGame, now: Date): 'playing' | 'backlog' {
  const recent = (game.rtime_last_played ?? 0) > now.getTime() / 1000 - TWO_WEEKS
  return recent && (game.playtime_2weeks ?? 0) > 0 ? 'playing' : 'backlog'
}

/** Qué juegos revisar en esta tanda: recientes, luego nunca revisados, luego los que más hace que se revisaron. */
export function pickAchievementGames(
  owned: OwnedGame[],
  syncedAt: Map<number, Date | null>,
  limit = ACHIEVEMENT_GAMES_PER_SYNC,
): OwnedGame[] {
  const rank = (g: OwnedGame) => {
    if ((g.playtime_2weeks ?? 0) > 0) return 0
    return syncedAt.get(g.appid) ? 2 : 1
  }
  return owned
    .filter((g) => g.has_community_visible_stats)
    .sort((a, b) => {
      const byRank = rank(a) - rank(b)
      if (byRank) return byRank
      if (rank(a) === 2) return syncedAt.get(a.appid)!.getTime() - syncedAt.get(b.appid)!.getTime()
      return b.playtime_forever - a.playtime_forever
    })
    .slice(0, limit)
}

interface SchemaAchievement {
  name: string
  displayName: string
  description?: string
  hidden: number
  icon: string
  icongray: string
}

export function mapSchema(gameId: number, schema: unknown, global: unknown) {
  const list =
    (schema as { game?: { availableGameStats?: { achievements?: SchemaAchievement[] } } } | null)?.game?.availableGameStats
      ?.achievements ?? []
  const percents = new Map(
    ((global as { achievementpercentages?: { achievements?: { name: string; percent: string | number }[] } } | null)
      ?.achievementpercentages?.achievements ?? []).map((a) => [a.name, Number(a.percent)]),
  )
  return list.map((a) => ({
    game_id: gameId,
    source: 'steam' as const,
    api_name: a.name,
    name: a.displayName,
    description: a.description || null,
    icon_url: a.icon,
    icon_locked_url: a.icongray,
    hidden: a.hidden === 1,
    global_percent: Number.isFinite(percents.get(a.name)) ? percents.get(a.name)! : null,
  }))
}

export function mapUnlocked(userId: string, player: unknown, idByApiName: Map<string, number>) {
  const stats = (player as { playerstats?: { success?: boolean; achievements?: { apiname: string; achieved: number; unlocktime: number }[] } } | null)
    ?.playerstats
  if (!stats?.success) return []
  return (stats.achievements ?? []).flatMap((a) => {
    const id = idByApiName.get(a.apiname)
    if (!a.achieved || id === undefined) return []
    return [{ user_id: userId, achievement_id: id, unlocked_at: a.unlocktime ? new Date(a.unlocktime * 1000).toISOString() : null }]
  })
}
