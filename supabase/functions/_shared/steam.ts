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

/** Una sincronización revisa los logros de todos los juegos, en tandas de este tamaño (una llamada cada una). */
export const ACHIEVEMENT_BATCH = 30
/** Una sincronización a medias que no continúa en este tiempo se da por abandonada. */
export const RUN_EXPIRES_MINUTES = 30

/**
 * La siguiente tanda de una sincronización completa: los juegos con logros que aún no se han revisado desde
 * que empezó (`since`), en el orden de pickAchievementGames, y cuántos quedarán después de esta tanda.
 */
export function nextAchievementBatch(
  owned: OwnedGame[],
  syncedAt: Map<number, Date | null>,
  since: Date,
  limit = ACHIEVEMENT_BATCH,
): { batch: OwnedGame[]; total: number; remaining: number } {
  const withStats = owned.filter((g) => g.has_community_visible_stats)
  const pending = withStats.filter((g) => {
    const at = syncedAt.get(g.appid)
    return !at || at < since
  })
  // Ya revisados en esta sincronización o no, el orden es el de siempre: recientes, nunca revisados, más antiguos.
  const batch = pickAchievementGames(pending, syncedAt, limit)
  return { batch, total: withStats.length, remaining: pending.length - batch.length }
}

/** Una tanda que continúa una sincronización: solo si es del mismo usuario, sigue en marcha y no ha caducado. */
export function canContinueRun(run: { user_id: string; status: string; started_at: string } | null, userId: string, now: Date) {
  return (
    !!run &&
    run.user_id === userId &&
    run.status === 'running' &&
    now.getTime() - new Date(run.started_at).getTime() < RUN_EXPIRES_MINUTES * 60_000
  )
}

/** Logros que el jugador tiene en Steam y Pulso aún no conoce (el juego ha añadido logros): hay que releer la lista. */
export function hasUnknownAchievements(player: unknown, known: Set<string>): boolean {
  const list = (player as { playerstats?: { achievements?: { apiname: string }[] } } | null)?.playerstats?.achievements ?? []
  return list.some((a) => !known.has(a.apiname))
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

const ICON_PATH = /\/steamcommunity\/public\/images\/apps\/(\d+)\/([\w.]+)$/

/** Steam aún da los iconos en una ruta antigua que ya no sirve para los juegos recientes. */
export function achievementIconUrl(url: string): string | null {
  if (!url) return null
  const match = ICON_PATH.exec(url)
  return match ? `https://shared.fastly.steamstatic.com/community_assets/images/apps/${match[1]}/${match[2]}` : url
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
    icon_url: achievementIconUrl(a.icon),
    icon_locked_url: achievementIconUrl(a.icongray),
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

/** ¿Esta sincronización ha completado todos los logros del juego? (para anunciar el platino una sola vez) */
export function becamePlatinum(unlockedBefore: number, unlockedAfter: number, total: number): boolean {
  return total > 0 && unlockedAfter === total && unlockedBefore < total
}
