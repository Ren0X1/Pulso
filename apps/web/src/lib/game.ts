import { supabase } from './supabase.ts'
import { loadMyFriendships, type PlayerSummary } from './friends.ts'
import type { CatalogGame, LibraryEntry } from './library.ts'
import type { GameAchievement } from './achievements.ts'

export interface FriendPlaytime extends PlayerSummary {
  minutes: number
}

export interface GamePageData {
  game: CatalogGame
  /** Tu entrada en la biblioteca, o null si no lo tienes. */
  entry: LibraryEntry | null
  unlocked: number
  total: number
  /** Amigos que lo tienen (los que su privacidad te deja ver), de más a menos horas. */
  friends: FriendPlaytime[]
}

const GAME = 'id, name, slug, summary, release_date, cover_url, genres, platforms, external:game_external_ids(source, external_id)'

export async function loadGamePage(me: string, gameId: number): Promise<GamePageData | null> {
  const [game, entry, progress, friendships] = await Promise.all([
    supabase!.from('games').select(GAME).eq('id', gameId).maybeSingle(),
    supabase!
      .from('user_games')
      .select(`game_id, status, favorite, tags, playtime_minutes, last_played_at, source, added_at, game:games!inner(${GAME})`)
      .eq('user_id', me)
      .eq('game_id', gameId)
      .maybeSingle(),
    supabase!.from('achievement_progress').select('unlocked, total').eq('user_id', me).eq('game_id', gameId).maybeSingle(),
    loadMyFriendships(me).catch(() => []),
  ])
  if (!game.data) return null

  const friendIds = friendships
    .filter((f) => f.status === 'accepted')
    .map((f) => (f.requester_id === me ? f.addressee_id : f.requester_id))
  let friends: FriendPlaytime[] = []
  if (friendIds.length) {
    const { data } = await supabase!
      .from('user_games')
      .select('playtime_minutes, player:profiles!user_games_user_id_fkey(id, username, avatar_url)')
      .eq('game_id', gameId)
      .in('user_id', friendIds)
    friends = ((data ?? []) as unknown as { playtime_minutes: number | null; player: PlayerSummary }[])
      .map((r) => ({ ...r.player, minutes: r.playtime_minutes ?? 0 }))
      .sort((a, b) => b.minutes - a.minutes)
  }

  const counts = progress.data as { unlocked: number; total: number } | null
  return {
    game: game.data as unknown as CatalogGame,
    entry: (entry.data as unknown as LibraryEntry | null) ?? null,
    unlocked: counts?.unlocked ?? 0,
    total: counts?.total ?? 0,
    friends,
  }
}

/** Los logros que te faltan (`unlocked_at` undefined), empezando por los más raros. */
export function missingAchievements(list: GameAchievement[], limit = 3): GameAchievement[] {
  return list
    .filter((a) => a.unlocked_at === undefined)
    .sort((a, b) => (a.global_percent ?? 101) - (b.global_percent ?? 101))
    .slice(0, limit)
}

/** Los últimos que conseguiste, el más reciente primero. */
export function latestUnlocked(list: GameAchievement[], limit = 3): GameAchievement[] {
  return list
    .filter((a) => typeof a.unlocked_at === 'string')
    .sort((a, b) => (b.unlocked_at as string).localeCompare(a.unlocked_at as string))
    .slice(0, limit)
}
