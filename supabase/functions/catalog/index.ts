// Edge Function: buscar en el catálogo mundial (IGDB).
//   GET ?q=<texto> → { games: GameRow & { id } [] }
// Lo encontrado se guarda en `games` (caché bajo demanda) para no depender de IGDB al volver a verlo.
// Exige sesión de Pulso (verify_jwt) para no gastar el cupo de IGDB con peticiones anónimas.

import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { IGDB_GAMES_URL, buildSearchQuery, mapIgdbGame, normalizeTerm } from '../_shared/igdb.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TWITCH_CLIENT_ID = Deno.env.get('TWITCH_CLIENT_ID') ?? ''
const TWITCH_CLIENT_SECRET = Deno.env.get('TWITCH_CLIENT_SECRET') ?? ''

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'GET, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } })

let token: { value: string; expiresAt: number } | null = null

async function twitchToken(): Promise<string> {
  if (token && token.expiresAt > Date.now() + 60_000) return token.value
  const params = new URLSearchParams({
    client_id: TWITCH_CLIENT_ID,
    client_secret: TWITCH_CLIENT_SECRET,
    grant_type: 'client_credentials',
  })
  const res = await fetch(`https://id.twitch.tv/oauth2/token?${params}`, { method: 'POST' })
  if (!res.ok) throw new Error(`twitch token ${res.status}`)
  const body = (await res.json()) as { access_token: string; expires_in: number }
  token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 }
  return token.value
}

async function searchIgdb(term: string) {
  const res = await fetch(IGDB_GAMES_URL, {
    method: 'POST',
    headers: {
      'Client-ID': TWITCH_CLIENT_ID,
      Authorization: `Bearer ${await twitchToken()}`,
      Accept: 'application/json',
    },
    body: buildSearchQuery(term),
  })
  if (res.status === 401) token = null
  if (!res.ok) throw new Error(`igdb ${res.status}`)
  return (await res.json()) as Parameters<typeof mapIgdbGame>[0][]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const term = normalizeTerm(new URL(req.url).searchParams.get('q') ?? '')
  if (!term) return json({ error: 'term_too_short' }, 400)
  if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) return json({ error: 'catalog_not_configured' }, 503)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  // verify_jwt también deja pasar la clave anónima: aquí se exige un usuario real.
  const jwt = req.headers.get('authorization')?.replace(/^Bearer /i, '') ?? ''
  const { data: auth } = await admin.auth.getUser(jwt)
  if (!auth.user) return json({ error: 'not_signed_in' }, 401)

  try {
    const mapped = (await searchIgdb(term)).map(mapIgdbGame)
    if (mapped.length === 0) return json({ games: [] })

    const { data: games, error } = await admin
      .from('games')
      .upsert(
        mapped.map((m) => ({ ...m.game, updated_at: new Date().toISOString() })),
        { onConflict: 'igdb_id' },
      )
      .select('id, igdb_id, slug, name, summary, release_date, cover_url, genres, platforms')
    if (error) throw new Error(`games: ${error.code}`)

    const idByIgdb = new Map(games.map((g: { id: number; igdb_id: number }) => [g.igdb_id, g.id]))
    const external = mapped.flatMap((m) => {
      const gameId = idByIgdb.get(m.game.igdb_id)
      if (!gameId) return []
      return [
        { game_id: gameId, source: 'igdb', external_id: String(m.game.igdb_id) },
        ...m.steamAppIds.map((appId) => ({ game_id: gameId, source: 'steam', external_id: appId })),
      ]
    })
    // Un AppID de Steam ya asignado a otro juego se respeta: el primero gana.
    await admin.from('game_external_ids').upsert(external, { onConflict: 'source,external_id', ignoreDuplicates: true })

    const order = new Map(mapped.map((m, i) => [m.game.igdb_id, i]))
    games.sort((a: { igdb_id: number }, b: { igdb_id: number }) => order.get(a.igdb_id)! - order.get(b.igdb_id)!)
    return json({ games })
  } catch (err) {
    console.error('catalog', err instanceof Error ? err.message : 'error desconocido')
    return json({ error: 'catalog_unavailable' }, 502)
  }
})
