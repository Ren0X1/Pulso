import { createPulsoClient, type SupabaseClient } from '@pulso/core'
import type { LoginClient } from './platform.ts'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** null si faltan las variables: la app lo dice en pantalla en vez de fallar. */
export const supabase: SupabaseClient | null = url && anonKey ? createPulsoClient(url, anonKey) : null

export function steamLoginUrl(client: LoginClient, state: string): string {
  const params = new URLSearchParams({ action: 'start', client, state })
  return `${url}/functions/v1/auth-steam?${params}`
}
