import { supabase } from './supabase.ts'

/**
 * Nivel Pulso: sube con las horas jugadas desde el launcher. Cada nivel cuesta un poco más que el anterior:
 * el nivel n empieza a las 2·(n−1)² horas (nivel 2 a las 2 h, nivel 5 a las 32 h, nivel 10 a las 162 h).
 */
export function levelFor(minutes: number): { level: number; progress: number; hoursToNext: number } {
  const hours = Math.max(0, minutes) / 60
  const level = Math.floor(Math.sqrt(hours / 2)) + 1
  const start = 2 * (level - 1) ** 2
  const next = 2 * level ** 2
  return {
    level,
    progress: (hours - start) / (next - start),
    hoursToNext: Math.max(0, Math.ceil(next - hours)),
  }
}

export async function loadPulsoMinutes(userId: string): Promise<number> {
  const { data } = await supabase!.from('pulso_playtime').select('minutes').eq('user_id', userId).maybeSingle()
  return (data as { minutes: number } | null)?.minutes ?? 0
}
