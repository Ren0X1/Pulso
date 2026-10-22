import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type { SupabaseClient }

export function createPulsoClient(url: string, anonKey: string): SupabaseClient {
  return createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  })
}
