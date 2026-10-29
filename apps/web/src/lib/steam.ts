import { supabase } from './supabase.ts'

/** Una tanda de steam-sync: la biblioteca entera al empezar y los logros de unos cuantos juegos cada vez. */
export interface SyncResult {
  run: string
  games: number
  added: number
  /** Juegos con logros en Steam. */
  achievementGames: number
  /** De esos, cuántos lleva revisados esta sincronización. */
  checked: number
  remaining: number
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
    case 'run_expired':
      return 'La sincronización se quedó a medias. Vuelve a sincronizar para terminarla.'
    case 'steam_unavailable':
      return 'Steam no responde ahora mismo. Inténtalo en unos minutos.'
    default:
      return 'No se pudo sincronizar. Inténtalo de nuevo en unos minutos.'
  }
}

async function syncBatch(run?: string): Promise<SyncResult | SyncFailure> {
  const { data, error } = await supabase!.functions.invoke('steam-sync', { method: 'POST', body: run ? { run } : {} })
  if (error) {
    const body = await (error as { context?: Response }).context?.json?.().catch(() => null)
    return (body as SyncFailure | null) ?? { error: 'server_error' }
  }
  return data as SyncResult
}

/** Junta una tanda con lo acumulado: los logros conseguidos se suman; los nuevos solo los cuenta la primera. */
export function mergeSync(total: SyncResult | null, batch: SyncResult): SyncResult {
  return total ? { ...batch, added: total.added, unlocked: total.unlocked + batch.unlocked } : batch
}

/** Sincroniza todo: pide tandas hasta que no quedan juegos por revisar, avisando del progreso. */
export async function syncSteam(
  onProgress?: (progress: SyncResult) => void,
  batch: (run?: string) => Promise<SyncResult | SyncFailure> = syncBatch,
): Promise<SyncResult | SyncFailure> {
  let total: SyncResult | null = null
  // Con 30 juegos por tanda, 200 tandas son 6000 juegos con logros: de sobra, y nunca un bucle infinito.
  for (let i = 0; i < 200; i++) {
    const res = await batch(total?.run)
    if ('error' in res) return res
    total = mergeSync(total, res)
    onProgress?.(total)
    if (res.remaining === 0) return total
  }
  return { error: 'server_error' }
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
