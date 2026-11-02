import { supabase } from './supabase.ts'
import { formatAgo, syncErrorMessage, type SyncRun } from './steam.ts'

/** Una sincronización vista desde el panel (de cualquier usuario). */
export type AdminRun = SyncRun & { user_id: string; username?: string | null }

export interface AdminUser {
  id: string
  username: string
  avatar_url: string | null
  created_at: string
  steam_id: string | null
  steam_name: string | null
  profile_visibility: 'public' | 'private' | null
  last_synced_at: string | null
  games: number
  achievements: number
  is_admin: boolean
  run: AdminRun | null
}

export interface AdminOverview {
  stats: { users: number; catalog: number; library: number; achievements: number; lists: number; running: number; errors: number }
  users: AdminUser[]
  runs: AdminRun[]
}

export class AdminError extends Error {}

/** Si este usuario puede entrar al panel (la tabla solo le deja ver su propia fila si no es administrador). */
export async function isAdmin(userId: string): Promise<boolean> {
  const { data } = await supabase!.from('app_admins').select('user_id').eq('user_id', userId).maybeSingle()
  return !!data
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase!.functions.invoke('admin', { method: 'POST', body })
  if (error) {
    const res = (await (error as { context?: Response }).context?.json?.().catch(() => null)) as { error?: string } | null
    throw new AdminError(res?.error ?? 'server_error')
  }
  return data as T
}

export const loadOverview = () => call<AdminOverview>({ action: 'overview' })
export const forceSync = (user: string) => call<{ run: number }>({ action: 'sync', user })
export const cancelSync = (run: number) => call<{ ok: true }>({ action: 'cancel', run })
export const grantAdmin = (user: string) => call<{ ok: true }>({ action: 'grant', user })
export const revokeAdmin = (user: string) => call<{ ok: true }>({ action: 'revoke', user })

export function adminErrorMessage(err: unknown): string {
  const code = err instanceof AdminError ? err.message : 'server_error'
  switch (code) {
    case 'forbidden':
      return 'Ya no tienes acceso al panel de administración.'
    case 'no_steam_account':
      return 'Ese usuario no tiene una cuenta de Steam vinculada.'
    case 'cannot_revoke_self':
      return 'No puedes quitarte el acceso a ti mismo: pídeselo a otro administrador.'
    case 'not_found':
      return 'Eso ya no existe (puede que otra persona lo haya cambiado).'
    default:
      return 'No se pudo completar la acción. Inténtalo de nuevo.'
  }
}

/** El estado de una sincronización en una línea, para las tablas del panel. */
export function runLabel(run: AdminRun | null, now = new Date()): string {
  if (!run) return 'Nunca'
  if (run.status === 'running') {
    if (run.total === null) return `Importando biblioteca · empezó ${formatAgo(run.started_at, now)}`
    return `Logros ${run.checked} de ${run.total} juegos · ${run.unlocked.toLocaleString('es')} conseguidos`
  }
  if (run.status === 'ok') return `Bien ${formatAgo(run.finished_at ?? run.started_at, now)} · ${run.checked} juegos revisados`
  return `Falló ${formatAgo(run.started_at, now)} · ${syncErrorMessage({ error: run.error ?? 'server_error' }).split('.')[0]}`
}
