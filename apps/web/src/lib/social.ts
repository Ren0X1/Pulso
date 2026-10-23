import type { CatalogGame } from './library.ts'
import { supabase } from './supabase.ts'

// ───────── Notificaciones ─────────

export interface NotificationRow {
  id: number
  kind: string
  payload: Record<string, string>
  read_at: string | null
  created_at: string
}

export function notificationText(n: Pick<NotificationRow, 'kind' | 'payload'>): { text: string; href: string } {
  const who = n.payload.username ?? 'Alguien'
  switch (n.kind) {
    case 'friend_request':
      return { text: `${who} te ha enviado una solicitud de amistad`, href: '/amigos' }
    case 'friend_accepted':
      return { text: `${who} ha aceptado tu solicitud de amistad`, href: `/u/${who}` }
    case 'list_invite':
      return {
        text: `${who} te ha invitado a «${n.payload.list_name}» (${n.payload.role === 'editor' ? 'puedes editarla' : 'puedes verla'})`,
        href: `/listas/${n.payload.list_id}`,
      }
    default:
      return { text: 'Tienes una notificación nueva', href: '/' }
  }
}

export async function loadNotifications(limit = 30): Promise<NotificationRow[]> {
  const { data } = await supabase!
    .from('notifications')
    .select('id, kind, payload, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as NotificationRow[]
}

export async function countUnread(): Promise<number> {
  const { count } = await supabase!.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null)
  return count ?? 0
}

export async function markAllRead() {
  await supabase!.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null)
}

// ───────── Actividad de amigos ─────────

export interface FeedEvent {
  id: number
  kind: string
  created_at: string
  payload: { name?: string; minutes?: number; achievements?: number }
  player: { username: string; avatar_url: string | null }
  game: Pick<CatalogGame, 'name' | 'cover_url'> | null
}

function duration(minutes = 0): string {
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}

export function feedText(event: Pick<FeedEvent, 'kind' | 'payload'>, gameName: string): string {
  switch (event.kind) {
    case 'played':
      return `ha jugado a ${gameName} · ${duration(event.payload.minutes)}`
    case 'platinum':
      return `ha conseguido el platino de ${gameName} (${event.payload.achievements} logros)`
    default:
      return `ha hecho algo en ${gameName}`
  }
}

/** Lo último de tus amigos. La base de datos aplica la privacidad de actividad de cada uno. */
export async function loadFriendsFeed(me: string, limit = 30): Promise<FeedEvent[]> {
  const { data: rows } = await supabase!
    .from('friendships')
    .select('requester_id, addressee_id')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${me},addressee_id.eq.${me}`)
  const friends = ((rows ?? []) as { requester_id: string; addressee_id: string }[]).map((r) =>
    r.requester_id === me ? r.addressee_id : r.requester_id,
  )
  if (friends.length === 0) return []
  const { data } = await supabase!
    .from('activity_events')
    .select('id, kind, created_at, payload, player:profiles!activity_events_user_id_fkey(username, avatar_url), game:games(name, cover_url)')
    .in('user_id', friends)
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as unknown as FeedEvent[]
}

// ───────── Comparar con un amigo ─────────

interface OwnedRow {
  game_id: number
  playtime_minutes: number | null
}
interface ProgressRow {
  game_id: number
  unlocked: number
  total: number
}
interface Side {
  minutes: number | null
  unlocked: number | null
  total: number | null
}
export interface CommonGame {
  game_id: number
  mine: Side
  theirs: Side
}

export function compareLibraries(
  mine: OwnedRow[],
  theirs: OwnedRow[],
  myProgress: ProgressRow[],
  theirProgress: ProgressRow[],
): { common: CommonGame[]; onlyMine: number; onlyTheirs: number } {
  const theirsById = new Map(theirs.map((g) => [g.game_id, g]))
  const myAch = new Map(myProgress.map((p) => [p.game_id, p]))
  const theirAch = new Map(theirProgress.map((p) => [p.game_id, p]))
  const side = (row: OwnedRow, ach: ProgressRow | undefined): Side => ({
    minutes: row.playtime_minutes,
    unlocked: ach?.unlocked ?? null,
    total: ach?.total ?? null,
  })
  const common = mine
    .filter((g) => theirsById.has(g.game_id))
    .map((g) => ({
      game_id: g.game_id,
      mine: side(g, myAch.get(g.game_id)),
      theirs: side(theirsById.get(g.game_id)!, theirAch.get(g.game_id)),
    }))
    .sort((a, b) => (b.mine.minutes ?? 0) + (b.theirs.minutes ?? 0) - ((a.mine.minutes ?? 0) + (a.theirs.minutes ?? 0)))
  return { common, onlyMine: mine.length - common.length, onlyTheirs: theirs.length - common.length }
}

/** Biblioteca (lo que la privacidad deje ver) y progreso de logros de un jugador. */
export async function loadComparable(userId: string) {
  const [{ data: games }, { data: progress }] = await Promise.all([
    supabase!.from('user_games').select('game_id, playtime_minutes').eq('user_id', userId).limit(5000),
    supabase!.from('achievement_progress').select('game_id, unlocked, total').eq('user_id', userId),
  ])
  return { games: (games ?? []) as OwnedRow[], progress: (progress ?? []) as ProgressRow[] }
}
