// Edge Function: importar de Steam la biblioteca, las horas y los logros del usuario.
//   POST → { games, added, achievementGames, unlocked } · 429 { error: 'cooldown', retry_after }
// La lógica que decide qué importar está en _shared/steam.ts y tiene tests.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0'
import {
  becamePlatinum,
  initialStatus,
  mapSchema,
  mapUnlocked,
  parseOwnedGames,
  pickAchievementGames,
  steamCoverUrl,
  syncCooldown,
  type OwnedGame,
  type SteamSyncError,
} from '../_shared/steam.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const STEAM_API_KEY = Deno.env.get('STEAM_API_KEY') ?? ''
const API = 'https://api.steampowered.com'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } })

class SyncError extends Error {
  constructor(readonly code: SteamSyncError) {
    super(code)
  }
}

async function steam(path: string, params: Record<string, string | number>): Promise<unknown> {
  const query = new URLSearchParams({ key: STEAM_API_KEY, format: 'json', ...params } as Record<string, string>)
  const res = await fetch(`${API}/${path}?${query}`)
  // Steam responde 400/403 a los logros de un juego que no los tiene o de un perfil privado.
  if (res.status === 400 || res.status === 403) return null
  if (!res.ok) throw new SyncError('steam_unavailable')
  return res.json()
}

/** Ejecuta las tareas de `limit` en `limit`, para no disparar cientos de llamadas a la vez. */
async function pool<T>(items: T[], limit: number, task: (item: T) => Promise<void>) {
  const queue = [...items]
  await Promise.all(Array.from({ length: limit }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await task(item)
  }))
}

const chunk = <T,>(list: T[], size: number) =>
  Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size))

async function importGames(admin: SupabaseClient, userId: string, owned: OwnedGame[]) {
  const now = new Date()
  const gameIdByApp = new Map<number, number>()
  for (const part of chunk(owned.map((g) => String(g.appid)), 200)) {
    const { data } = await admin.from('game_external_ids').select('game_id, external_id').eq('source', 'steam').in('external_id', part)
    for (const row of data ?? []) gameIdByApp.set(Number(row.external_id), row.game_id)
  }

  const missing = owned.filter((g) => !gameIdByApp.has(g.appid))
  for (const part of chunk(missing, 200)) {
    const { data, error } = await admin
      .from('games')
      .upsert(part.map((g) => ({ slug: `steam-${g.appid}`, name: g.name, cover_url: steamCoverUrl(g.appid) })), { onConflict: 'slug' })
      .select('id, slug')
    if (error) throw new Error(`games: ${error.code}`)
    for (const row of data) gameIdByApp.set(Number(row.slug.slice('steam-'.length)), row.id)
    await admin.from('game_external_ids').upsert(
      data.map((row) => ({ game_id: row.id, source: 'steam', external_id: row.slug.slice('steam-'.length) })),
      { onConflict: 'source,external_id', ignoreDuplicates: true },
    )
  }

  const { data: existing } = await admin.from('user_games').select('game_id, achievements_synced_at').eq('user_id', userId)
  const have = new Map((existing ?? []).map((r) => [r.game_id as number, r.achievements_synced_at as string | null]))

  const rows = owned.map((g) => ({
    user_id: userId,
    game_id: gameIdByApp.get(g.appid)!,
    source: 'steam',
    playtime_minutes: g.playtime_forever,
    last_played_at: g.rtime_last_played ? new Date(g.rtime_last_played * 1000).toISOString() : null,
  }))
  const fresh = rows.filter((r) => !have.has(r.game_id))
  for (const part of chunk(fresh, 500)) {
    const byGame = new Map(owned.map((g) => [gameIdByApp.get(g.appid), g]))
    const { error } = await admin
      .from('user_games')
      .upsert(part.map((r) => ({ ...r, status: initialStatus(byGame.get(r.game_id)!, now) })), {
        onConflict: 'user_id,game_id',
        ignoreDuplicates: true,
      })
    if (error) throw new Error(`user_games insert: ${error.code}`)
  }
  // Los que ya estaban (también los añadidos a mano) actualizan horas y origen sin tocar estado, favorito ni etiquetas.
  for (const part of chunk(rows.filter((r) => have.has(r.game_id)), 500)) {
    const { error } = await admin.from('user_games').upsert(part, { onConflict: 'user_id,game_id' })
    if (error) throw new Error(`user_games update: ${error.code}`)
  }

  const syncedAt = new Map(owned.map((g) => {
    const at = have.get(gameIdByApp.get(g.appid)!)
    return [g.appid, at ? new Date(at) : null] as const
  }))
  return { gameIdByApp, added: fresh.length, syncedAt }
}

async function syncAchievements(admin: SupabaseClient, userId: string, steamId: string, games: OwnedGame[], gameIdByApp: Map<number, number>) {
  let unlocked = 0
  await pool(games, 5, async (game) => {
    const gameId = gameIdByApp.get(game.appid)!
    let { data: known } = await admin.from('achievements').select('id, api_name').eq('game_id', gameId)
    if (!known?.length) {
      const [schema, global] = await Promise.all([
        steam('ISteamUserStats/GetSchemaForGame/v2/', { appid: game.appid, l: 'spanish' }),
        steam('ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/', { gameid: game.appid }),
      ])
      const rows = mapSchema(gameId, schema, global)
      if (rows.length) {
        const { data } = await admin.from('achievements').upsert(rows, { onConflict: 'game_id,source,api_name' }).select('id, api_name')
        known = data
      }
    }
    if (known?.length) {
      const player = await steam('ISteamUserStats/GetPlayerAchievements/v1/', { steamid: steamId, appid: game.appid })
      const ids = new Map(known.map((a) => [a.api_name as string, a.id as number]))
      const rows = mapUnlocked(userId, player, ids)
      if (rows.length) {
        const { count: before } = await admin
          .from('user_achievements')
          .select('achievement_id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .in('achievement_id', [...ids.values()])
        await admin.from('user_achievements').upsert(rows, { onConflict: 'user_id,achievement_id' })
        unlocked += rows.length
        // Platino nuevo: queda en la actividad (y en el feed de los amigos, según la privacidad).
        if (becamePlatinum(before ?? 0, rows.length, known.length)) {
          await admin.from('activity_events').insert({
            user_id: userId,
            kind: 'platinum',
            game_id: gameId,
            payload: { name: game.name, appid: game.appid, achievements: known.length },
          })
        }
      }
    }
    await admin
      .from('user_games')
      .update({ achievements_synced_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('game_id', gameId)
  })
  return unlocked
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const jwt = req.headers.get('authorization')?.replace(/^Bearer /i, '') ?? ''
  const { data: auth } = await admin.auth.getUser(jwt)
  const user = auth.user
  if (!user) return json({ error: 'not_signed_in' }, 401)

  const { data: account } = await admin
    .from('linked_accounts')
    .select('external_user_id')
    .eq('user_id', user.id)
    .eq('platform', 'steam')
    .maybeSingle()
  if (!account) return json({ error: 'no_steam_account' }, 400)
  const steamId = account.external_user_id as string

  const { data: last } = await admin
    .from('sync_runs')
    .select('started_at')
    .eq('user_id', user.id)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const wait = syncCooldown(last ? new Date(last.started_at) : null, new Date())
  if (wait > 0) return json({ error: 'cooldown', retry_after: wait }, 429)

  const { data: run } = await admin.from('sync_runs').insert({ user_id: user.id, platform: 'steam' }).select('id').single()
  const finish = (status: 'ok' | 'error', error: string | null = null) =>
    admin.from('sync_runs').update({ status, error, finished_at: new Date().toISOString() }).eq('id', run!.id)

  try {
    const summary = (await steam('ISteamUser/GetPlayerSummaries/v2/', { steamids: steamId })) as {
      response?: { players?: { personaname: string; avatarfull?: string; communityvisibilitystate?: number }[] }
    } | null
    const player = summary?.response?.players?.[0]
    if (!player) throw new SyncError('steam_unavailable')
    const visible = player.communityvisibilitystate === 3
    await admin
      .from('linked_accounts')
      .update({ display_name: player.personaname, avatar_url: player.avatarfull ?? null, profile_visibility: visible ? 'public' : 'private' })
      .eq('user_id', user.id)
      .eq('platform', 'steam')
    if (!visible) throw new SyncError('profile_private')

    const parsed = parseOwnedGames(
      await steam('IPlayerService/GetOwnedGames/v1/', { steamid: steamId, include_appinfo: 1, include_played_free_games: 1 }),
    )
    if (!parsed.ok) throw new SyncError(parsed.error)

    const { gameIdByApp, added, syncedAt } = await importGames(admin, user.id, parsed.games)
    const batch = pickAchievementGames(parsed.games, syncedAt)
    const unlocked = await syncAchievements(admin, user.id, steamId, batch, gameIdByApp)

    await admin
      .from('linked_accounts')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('platform', 'steam')
    await finish('ok')
    return json({ games: parsed.games.length, added, achievementGames: batch.length, unlocked })
  } catch (err) {
    const code = err instanceof SyncError ? err.code : 'server_error'
    // Solo el código: nunca datos del usuario en los logs.
    console.error('steam-sync', code, err instanceof SyncError ? '' : err instanceof Error ? err.message : '')
    await finish('error', code)
    return json({ error: code }, err instanceof SyncError ? 422 : 500)
  }
})
