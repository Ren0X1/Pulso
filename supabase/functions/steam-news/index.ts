// Edge Function: noticias oficiales de Steam de unos juegos (la API de Steam no deja pedirlas desde el navegador).
//   POST { appids: number[], limit? } → { news: NewsItem[] }   (hasta 12 juegos y 20 noticias; solo con sesión)
// La lógica que limpia y ordena las noticias está en _shared/news.ts y tiene tests.

import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { mergeNews, parseNews } from '../_shared/news.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const MAX_APPS = 12
const MAX_NEWS = 20

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    // Las noticias cambian poco: el navegador puede reutilizarlas media hora.
    headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'private, max-age=1800' },
  })

async function newsFor(appid: number) {
  try {
    const query = new URLSearchParams({ appid: String(appid), count: '8', maxlength: '600', feeds: 'steam_community_announcements', format: 'json' })
    const res = await fetch(`https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?${query}`)
    return res.ok ? parseNews(appid, await res.json()) : []
  } catch {
    return []
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const jwt = req.headers.get('authorization')?.replace(/^Bearer /i, '') ?? ''
  const { data: auth } = await admin.auth.getUser(jwt)
  if (!auth.user) return json({ error: 'not_signed_in' }, 401)

  const body = (await req.json().catch(() => ({}))) as { appids?: unknown; limit?: unknown }
  const appids = [...new Set(Array.isArray(body.appids) ? body.appids : [])]
    .filter((a): a is number => Number.isInteger(a) && (a as number) > 0)
    .slice(0, MAX_APPS)
  const limit = typeof body.limit === 'number' ? Math.min(MAX_NEWS, Math.max(1, Math.floor(body.limit))) : 6
  if (appids.length === 0) return json({ news: [] })

  return json({ news: mergeNews(await Promise.all(appids.map(newsFor)), limit) })
})
