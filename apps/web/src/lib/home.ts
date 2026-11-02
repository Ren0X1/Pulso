import { supabase } from './supabase.ts'
import { steamAppId } from './desktop.ts'
import type { CatalogGame, LibraryEntry } from './library.ts'

/** Arte horizontal grande de Steam para la cabecera de Inicio (el mismo que usa la biblioteca de Steam). */
export function steamHeroUrl(appid: number): string {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_hero.jpg`
}

export type HomeEntry = Pick<LibraryEntry, 'game_id' | 'playtime_minutes' | 'last_played_at' | 'favorite'> & {
  game: Pick<CatalogGame, 'id' | 'name' | 'slug' | 'cover_url' | 'external'>
}

export interface HeroGame {
  entry: HomeEntry
  appid: number | null
  unlocked: number
  total: number
  /** Amigos (y gente visible para ti) que también lo tienen. */
  owners: number
}

export interface WeekDay {
  /** L, M, X, J, V, S, D */
  label: string
  minutes: number
  today: boolean
}

const DAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

/** Lunes 00:00 (hora local) de la semana de `now`. */
export function weekStart(now: Date): Date {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  return start
}

/** Minutos jugados cada día de esta semana, de lunes a domingo, a partir de las partidas registradas. */
export function weekMinutes(sessions: { created_at: string; minutes: number }[], now = new Date()): WeekDay[] {
  const start = weekStart(now)
  const days = DAY_LABELS.map((label, i) => ({ label, minutes: 0, today: (now.getDay() + 6) % 7 === i }))
  for (const s of sessions) {
    const at = new Date(s.created_at)
    const index = Math.floor((at.getTime() - start.getTime()) / 86_400_000)
    if (index >= 0 && index < 7) days[index]!.minutes += Math.max(0, s.minutes)
  }
  return days
}

/** "11 h", "45 min", "1,5 h": las horas en una cifra corta. */
export function shortHours(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  return `${(minutes / 60).toLocaleString('es', { maximumFractionDigits: minutes < 600 ? 1 : 0 })} h`
}

const ENTRY = 'game_id, playtime_minutes, last_played_at, favorite, game:games!inner(id, name, slug, cover_url, external:game_external_ids(source, external_id))'

export async function loadRecent(userId: string, limit = 9): Promise<HomeEntry[]> {
  const { data } = await supabase!
    .from('user_games')
    .select(ENTRY)
    .eq('user_id', userId)
    .order('last_played_at', { ascending: false, nullsFirst: false })
    .order('added_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as unknown as HomeEntry[]
}

/** Los juegos que marcaste como favoritos: la barra de fijados. */
export async function loadPinned(userId: string, limit = 6): Promise<HomeEntry[]> {
  const { data } = await supabase!
    .from('user_games')
    .select(ENTRY)
    .eq('user_id', userId)
    .eq('favorite', true)
    .order('last_played_at', { ascending: false, nullsFirst: false })
    .limit(limit)
  return (data ?? []) as unknown as HomeEntry[]
}

export async function countUnplayed(userId: string): Promise<number> {
  const { count } = await supabase!
    .from('user_games')
    .select('game_id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('playtime_minutes', 0)
  return count ?? 0
}

export async function loadHero(userId: string, entry: HomeEntry): Promise<HeroGame> {
  const [progress, owners] = await Promise.all([
    supabase!.from('achievement_progress').select('unlocked, total').eq('user_id', userId).eq('game_id', entry.game_id).maybeSingle(),
    supabase!
      .from('user_games')
      .select('user_id', { count: 'exact', head: true })
      .eq('game_id', entry.game_id)
      .neq('user_id', userId),
  ])
  const row = progress.data as { unlocked: number; total: number } | null
  return {
    entry,
    appid: steamAppId(entry.game.external),
    unlocked: row?.unlocked ?? 0,
    total: row?.total ?? 0,
    owners: owners.count ?? 0,
  }
}

/** Partidas de esta semana registradas por el launcher (las de Steam sin Pulso no tienen fecha por día). */
export async function loadWeek(userId: string, now = new Date()): Promise<WeekDay[]> {
  const { data } = await supabase!
    .from('activity_events')
    .select('created_at, payload')
    .eq('user_id', userId)
    .eq('kind', 'played')
    .gte('created_at', weekStart(now).toISOString())
  const sessions = (data ?? []).map((e) => ({
    created_at: e.created_at as string,
    minutes: Number((e.payload as { minutes?: number } | null)?.minutes ?? 0),
  }))
  return weekMinutes(sessions, now)
}
