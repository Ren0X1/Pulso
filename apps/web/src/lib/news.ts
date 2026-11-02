import { supabase } from './supabase.ts'

/** Un anuncio oficial de Steam de uno de tus juegos (lo trae la Edge Function steam-news). */
export interface NewsItem {
  appid: number
  title: string
  url: string
  /** Segundos Unix. */
  date: number
  excerpt: string
  image: string | null
}

export async function loadNews(appids: number[], limit = 6): Promise<NewsItem[]> {
  if (appids.length === 0) return []
  const { data, error } = await supabase!.functions.invoke('steam-news', { method: 'POST', body: { appids, limit } })
  if (error) return []
  return ((data as { news?: NewsItem[] } | null)?.news ?? []).filter((n) => n.url.startsWith('https://'))
}

/** "hace 2 días", "hace 3 h": cuándo se publicó. */
export function newsAgo(date: number, now = Date.now()): string {
  const hours = Math.max(0, (now / 1000 - date) / 3600)
  if (hours < 1) return 'hace un momento'
  if (hours < 24) return `hace ${Math.floor(hours)} h`
  const days = Math.floor(hours / 24)
  if (days < 30) return days === 1 ? 'hace 1 día' : `hace ${days} días`
  return new Date(date * 1000).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })
}
