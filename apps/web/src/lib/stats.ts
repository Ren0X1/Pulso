import type { CatalogGame, GameStatus } from './library.ts'
import { supabase } from './supabase.ts'

export interface StatsRow {
  status: string
  playtime_minutes: number | null
  game: Pick<CatalogGame, 'name' | 'cover_url'>
}

const round1 = (n: number) => Math.round(n * 10) / 10

export function summarizeLibrary(rows: StatsRow[]) {
  const byStatus: Record<GameStatus, number> = { backlog: 0, playing: 0, completed: 0, dropped: 0 }
  let minutes = 0
  let played = 0
  for (const r of rows) {
    if (r.status in byStatus) byStatus[r.status as GameStatus]++
    if (r.playtime_minutes) {
      minutes += r.playtime_minutes
      played++
    }
  }
  return { games: rows.length, hours: round1(minutes / 60), played, unplayed: rows.length - played, byStatus }
}

export function topByPlaytime(rows: StatsRow[], n = 10) {
  return rows
    .filter((r) => (r.playtime_minutes ?? 0) > 0)
    .sort((a, b) => b.playtime_minutes! - a.playtime_minutes!)
    .slice(0, n)
    .map((r) => ({ name: r.game.name, hours: round1(r.playtime_minutes! / 60), cover_url: r.game.cover_url }))
}

const monthLabel = new Intl.DateTimeFormat('es', { month: 'short', year: 'numeric', timeZone: 'UTC' })

/** Los últimos `months` meses hasta `now`, con 0 en los que no hubo logros. */
export function monthSeries(rows: { month: string; unlocked: number }[], now: Date, months = 24) {
  const counts = new Map(rows.map((r) => [r.month.slice(0, 7), r.unlocked]))
  return Array.from({ length: months }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1 - i), 1))
    const key = d.toISOString().slice(0, 7)
    return { key, label: monthLabel.format(d).replace('.', ''), value: counts.get(key) ?? 0 }
  })
}

export async function loadStats(userId: string) {
  const [library, months, progress] = await Promise.all([
    supabase!.from('user_games').select('status, playtime_minutes, game:games!inner(name, cover_url)').eq('user_id', userId).limit(5000),
    supabase!.from('achievements_by_month').select('month, unlocked').eq('user_id', userId),
    supabase!.from('achievement_progress').select('unlocked, total').eq('user_id', userId),
  ])
  const progressRows = (progress.data ?? []) as { unlocked: number; total: number }[]
  return {
    rows: (library.data ?? []) as unknown as StatsRow[],
    months: (months.data ?? []) as { month: string; unlocked: number }[],
    achievements: progressRows.reduce((sum, p) => sum + p.unlocked, 0),
    platinums: progressRows.filter((p) => p.total > 0 && p.unlocked === p.total).length,
  }
}
