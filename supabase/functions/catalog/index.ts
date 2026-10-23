// Edge Function: buscar en el catálogo mundial (IGDB).
//   GET ?q=<texto> → { games: GameRow & { id } [] }
// Lo encontrado se guarda en `games` (caché bajo demanda) para no depender de IGDB al volver a verlo.
// Exige sesión de Pulso (comprobada en el código: verify_jwt rompería la petición previa de CORS)
// para no gastar el cupo de IGDB con peticiones anónimas.

import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { IGDB_GAMES_URL, buildSearchQuery, mapIgdbGame, normalizeTerm, planCatalogMerge } from '../_shared/igdb.ts'

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
  // Se exige un usuario real: la clave pública sola no basta.
  const jwt = req.headers.get('authorization')?.replace(/^Bearer /i, '') ?? ''
  const { data: auth } = await admin.auth.getUser(jwt)
  if (!auth.user) return json({ error: 'not_signed_in' }, 401)

  try {
    const mapped = (await searchIgdb(term)).map(mapIgdbGame)
    if (mapped.length === 0) return json({ games: [] })

    const COLUMNS = 'id, igdb_id, slug, name, summary, release_date, cover_url, genres, platforms'
    const now = new Date().toISOString()

    // Juegos ya importados de Steam: se completan con IGDB en vez de duplicarse.
    const steamIds = mapped.flatMap((m) => m.steamAppIds)
    const gameBySteamApp = new Map<string, { id: number; igdb_id: number | null }>()
    if (steamIds.length) {
      const { data } = await admin
        .from('game_external_ids')
        .select('external_id, game:games!inner(id, igdb_id)')
        .eq('source', 'steam')
        .in('external_id', steamIds)
      for (const row of (data ?? []) as unknown as { external_id: string; game: { id: number; igdb_id: number | null } }[]) {
        gameBySteamApp.set(row.external_id, row.game)
      }
    }
    const plan = planCatalogMerge(mapped, gameBySteamApp)

    const games: { id: number; igdb_id: number }[] = []
    for (const { gameId, row } of plan.merge) {
      // La portada vertical oficial de Steam se queda; el resto lo aporta IGDB.
      const { slug: _slug, cover_url: _cover, ...igdb } = row
      const { data } = await admin.from('games').update({ ...igdb, updated_at: now }).eq('id', gameId).select(COLUMNS).single()
      if (data) games.push(data)
    }
    if (plan.insert.length) {
      const { data, error } = await admin
        .from('games')
        .upsert(plan.insert.map((m) => ({ ...m.game, updated_at: now })), { onConflict: 'igdb_id' })
        .select(COLUMNS)
      if (error) throw new Error(`games: ${error.code}`)
      games.push(...data)
    }

    const idByIgdb = new Map(games.map((g) => [g.igdb_id, g.id]))
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
    games.sort((a, b) => order.get(a.igdb_id)! - order.get(b.igdb_id)!)
    return json({ games })
  } catch (err) {
    console.error('catalog', err instanceof Error ? err.message : 'error desconocido')
    return json({ error: 'catalog_unavailable' }, 502)
  }
})
