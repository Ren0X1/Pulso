import { supabase } from './supabase.ts'

export interface SyncResult {
  games: number
  added: number
  achievementGames: number
  unlocked: number
}

export type SyncFailure = { error: string; retry_after?: number }

export function syncErrorMessage(failure: SyncFailure): string {
  switch (failure.error) {
    case 'profile_private':
      return 'Tu perfil de Steam es privado. En Steam, Editar perfil → Privacidad, pon "Mi perfil" en Público.'
    case 'games_private':
      return 'Steam no comparte tus juegos: pon "Detalles de juego" en Público en la privacidad de tu perfil de Steam.'
    case 'cooldown':
      return `Ya sincronizaste hace poco. Vuelve a intentarlo en ${Math.ceil((failure.retry_after ?? 600) / 60)} min.`
    case 'steam_unavailable':
      return 'Steam no responde ahora mismo. Inténtalo en unos minutos.'
    default:
      return 'No se pudo sincronizar. Inténtalo de nuevo en unos minutos.'
  }
}

export async function syncSteam(): Promise<SyncResult | SyncFailure> {
  const { data, error } = await supabase!.functions.invoke('steam-sync', { method: 'POST' })
  if (error) {
    const body = await (error as { context?: Response }).context?.json?.().catch(() => null)
    return (body as SyncFailure | null) ?? { error: 'server_error' }
  }
  return data as SyncResult
}

export interface LastSync {
  status: 'running' | 'ok' | 'error'
  error: string | null
  started_at: string
  finished_at: string | null
}

export async function loadLastSync(): Promise<LastSync | null> {
  const { data } = await supabase!
    .from('sync_runs')
    .select('status, error, started_at, finished_at')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as LastSync | null) ?? null
}

export function formatAgo(iso: string, now = new Date()): string {
  const seconds = Math.max(0, (now.getTime() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'hace un momento'
  if (seconds < 3600) return `hace ${Math.floor(seconds / 60)} min`
  if (seconds < 86400) return `hace ${Math.floor(seconds / 3600)} h`
  const days = Math.floor(seconds / 86400)
  return days === 1 ? 'hace 1 día' : `hace ${days} días`
}

/** Rareza según el % global de jugadores de Steam que tienen el logro. */
export function rarityLabel(percent: number | null): string | null {
  if (percent === null) return null
  if (percent < 5) return 'Ultra raro'
  if (percent < 15) return 'Raro'
  if (percent < 50) return 'Poco común'
  return 'Común'
}
