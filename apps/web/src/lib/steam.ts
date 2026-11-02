import { supabase } from './supabase.ts'

/** Una sincronización con Steam tal como la guarda el servidor: avanza sola, tanda a tanda. */
export interface SyncRun {
  id: number
  status: 'running' | 'ok' | 'error'
  error: string | null
  started_at: string
  finished_at: string | null
  updated_at: string
  /** Juegos en Steam (null hasta que termina la primera tanda). */
  games: number | null
  added: number
  /** Juegos con logros en Steam, y cuántos lleva revisados. */
  total: number | null
  checked: number
  unlocked: number
  /** Juegos cuyos logros oculta Steam (privados en la biblioteca o que ya no son tuyos): se saltan. */
  hidden_games: number
  /** Si la lanzó un administrador. */
  forced_by: string | null
}

export type SyncFailure = { error: string; retry_after?: number }

/** Sin avanzar este tiempo, la web relanza la tanda (lo mismo que RUN_STALL_SECONDS en el servidor). */
export const STALL_SECONDS = 90

export function syncErrorMessage(failure: SyncFailure): string {
  switch (failure.error) {
    case 'profile_private':
      return 'Tu perfil de Steam es privado. En Steam, Editar perfil → Privacidad, pon "Mi perfil" en Público.'
    case 'games_private':
      return 'Steam no comparte tus juegos: pon "Detalles de juego" en Público en la privacidad de tu perfil de Steam.'
    case 'achievements_private':
      return 'Steam no comparte tus logros: pon "Detalles de juego" en Público (no "Solo amigos") en la privacidad de tu perfil de Steam. Tu biblioteca y tus horas sí se han importado.'
    case 'cooldown':
      return `Ya sincronizaste hace poco. Vuelve a intentarlo en ${Math.ceil((failure.retry_after ?? 600) / 60)} min.`
    case 'run_expired':
    case 'interrupted':
      return 'La sincronización se quedó a medias. Vuelve a sincronizar para terminarla.'
    case 'cancelled':
      return 'Un administrador paró la sincronización. Vuelve a sincronizar cuando quieras.'
    case 'steam_unavailable':
      return 'Steam no responde ahora mismo. Inténtalo en unos minutos.'
    default:
      return 'No se pudo sincronizar. Inténtalo de nuevo en unos minutos.'
  }
}

async function callSync(body: Record<string, unknown>): Promise<{ run: number } | SyncFailure> {
  const { data, error } = await supabase!.functions.invoke('steam-sync', { method: 'POST', body })
  if (error) {
    const res = await (error as { context?: Response }).context?.json?.().catch(() => null)
    return (res as SyncFailure | null) ?? { error: 'server_error' }
  }
  return data as { run: number }
}

/** Empieza una sincronización completa; sigue sola en el servidor aunque se cierre la web. */
export const startSync = () => callSync({})

/** Relanza la tanda de una sincronización que lleva rato sin avanzar. */
export const kickSync = (run: number) => callSync({ run })

/** Si una sincronización en marcha lleva demasiado sin avanzar. */
export function isStalled(run: Pick<SyncRun, 'status' | 'updated_at'>, now = new Date()): boolean {
  return run.status === 'running' && now.getTime() - new Date(run.updated_at).getTime() >= STALL_SECONDS * 1000
}

/** Qué está haciendo una sincronización en marcha, en palabras. */
export function syncProgressText(run: Pick<SyncRun, 'games' | 'total' | 'checked'>): string {
  if (run.games === null || run.total === null) return 'Importando tu biblioteca y tus horas…'
  return `Revisando logros: ${run.checked} de ${run.total} juegos…`
}

/** Resumen de una sincronización terminada. */
export function syncSummaryText(run: Pick<SyncRun, 'games' | 'added' | 'checked' | 'unlocked' | 'hidden_games'>): string {
  const text = `${run.games ?? 0} juegos en Steam · ${run.added} nuevos en tu biblioteca · logros revisados en ${run.checked} juegos (${run.unlocked} conseguidos)`
  return run.hidden_games > 0 ? `${text} · ${hiddenText(run.hidden_games)}` : text
}

/** Juegos que Steam no deja leer, con el porqué (lo más habitual: marcados como privados en tu biblioteca). */
export function hiddenText(count: number): string {
  return count === 1
    ? '1 juego con los logros ocultos en Steam (privado en tu biblioteca o ya no es tuyo)'
    : `${count} juegos con los logros ocultos en Steam (privados en tu biblioteca o ya no son tuyos)`
}

/** Al abrir Pulso se sincroniza solo si la última sincronización tiene más de estas horas. */
export const AUTO_SYNC_HOURS = 6

/** Si toca sincronizar sola al abrir: nunca se ha hecho, o la última (bien o mal) es de hace más de 6 h. */
export function shouldAutoSync(last: Pick<SyncRun, 'status' | 'started_at'> | null, now = new Date()): boolean {
  if (!last) return true
  if (last.status === 'running') return false
  return now.getTime() - new Date(last.started_at).getTime() >= AUTO_SYNC_HOURS * 3_600_000
}

export const SYNC_RUN_FIELDS = 'id, status, error, started_at, finished_at, updated_at, games, added, total, checked, unlocked, hidden_games, forced_by'

export async function loadLastSync(): Promise<SyncRun | null> {
  const { data } = await supabase!
    .from('sync_runs')
    .select(SYNC_RUN_FIELDS)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as SyncRun | null) ?? null
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
