import type { CatalogGame } from './library.ts'
import { supabase } from './supabase.ts'

export interface GameProgress {
  game_id: number
  unlocked: number
  total: number
  last_unlocked_at: string | null
  game: Pick<CatalogGame, 'id' | 'name' | 'cover_url'>
}

export interface UnlockedAchievement {
  unlocked_at: string | null
  achievement: {
    id: number
    name: string
    description: string | null
    icon_url: string | null
    global_percent: number | null
    game: Pick<CatalogGame, 'id' | 'name'>
  }
}

export interface GameAchievement {
  id: number
  name: string
  description: string | null
  icon_url: string | null
  icon_locked_url: string | null
  hidden: boolean
  global_percent: number | null
  unlocked_at: string | null | undefined
}

export async function loadProgress(userId: string): Promise<GameProgress[]> {
  const { data, error } = await supabase!
    .from('achievement_progress')
    .select('game_id, unlocked, total, last_unlocked_at')
    .eq('user_id', userId)
  if (error) throw error
  const rows = (data ?? []) as Omit<GameProgress, 'game'>[]
  if (rows.length === 0) return []
  const { data: games } = await supabase!.from('games').select('id, name, cover_url').in('id', rows.map((r) => r.game_id))
  const byId = new Map(((games ?? []) as GameProgress['game'][]).map((g) => [g.id, g]))
  return rows
    .flatMap((r) => (byId.has(r.game_id) ? [{ ...r, game: byId.get(r.game_id)! }] : []))
    .sort((a, b) => b.unlocked / b.total - a.unlocked / a.total || b.unlocked - a.unlocked)
}

export async function loadRecentUnlocks(userId: string, limit = 12): Promise<UnlockedAchievement[]> {
  const { data, error } = await supabase!
    .from('user_achievements')
    .select('unlocked_at, achievement:achievements!inner(id, name, description, icon_url, global_percent, game:games!inner(id, name))')
    .eq('user_id', userId)
    .not('unlocked_at', 'is', null)
    .order('unlocked_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data as unknown as UnlockedAchievement[]
}

/** Logros de un juego con los que tiene el usuario; los ocultos no conseguidos no revelan su nombre. */
export async function loadGameAchievements(userId: string, gameId: number): Promise<GameAchievement[]> {
  const { data: all } = await supabase!
    .from('achievements')
    .select('id, name, description, icon_url, icon_locked_url, hidden, global_percent')
    .eq('game_id', gameId)
  const list = (all ?? []) as Omit<GameAchievement, 'unlocked_at'>[]
  if (list.length === 0) return []
  const { data: mine } = await supabase!
    .from('user_achievements')
    .select('achievement_id, unlocked_at')
    .eq('user_id', userId)
    .in('achievement_id', list.map((a) => a.id))
  const unlocked = new Map(((mine ?? []) as { achievement_id: number; unlocked_at: string | null }[]).map((m) => [m.achievement_id, m.unlocked_at]))
  return list
    .map((a) => ({ ...a, unlocked_at: unlocked.has(a.id) ? unlocked.get(a.id) : undefined }))
    .sort((a, b) => Number(b.unlocked_at !== undefined) - Number(a.unlocked_at !== undefined) || (a.global_percent ?? 100) - (b.global_percent ?? 100))
}

type ProgressCounts = Pick<GameProgress, 'game_id' | 'unlocked' | 'total'>

/** Platino: todos los logros de Steam del juego conseguidos. */
export function platinumGameIds(rows: ProgressCounts[]): Set<number> {
  return new Set(rows.filter((r) => r.total > 0 && r.unlocked === r.total).map((r) => r.game_id))
}

/** Juegos platinados de un jugador; la vista respeta la privacidad de logros de cada uno. */
export async function loadPlatinums(userId: string): Promise<Set<number>> {
  const { data } = await supabase!.from('achievement_progress').select('game_id, unlocked, total').eq('user_id', userId)
  return platinumGameIds((data ?? []) as ProgressCounts[])
}
