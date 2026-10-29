// Edge Function: importar de Steam la biblioteca, las horas y los logros del usuario.
// Una sincronización revisa los logros de TODOS los juegos, en tandas (los límites de las Edge Functions
// gratuitas no dan para cientos de juegos en una sola llamada):
//   POST {}            → empieza: biblioteca y horas completas + la primera tanda de logros
//   POST { run: id }   → la siguiente tanda de esa sincronización
//   → { run, games, added, achievementGames, checked, remaining, unlocked } · 429 { error: 'cooldown', retry_after }
// La lógica que decide qué importar está en _shared/steam.ts y tiene tests.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0'
import {
  becamePlatinum,
  canContinueRun,
  hasUnknownAchievements,
  initialStatus,
  mapSchema,
  mapUnlocked,
  nextAchievementBatch,
  parseOwnedGames,
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

async function gameIdsByApp(admin: SupabaseClient, owned: OwnedGame[]) {
  const gameIdByApp = new Map<number, number>()
  for (const part of chunk(owned.map((g) => String(g.appid)), 200)) {
    const { data } = await admin.from('game_external_ids').select('game_id, external_id').eq('source', 'steam').in('external_id', part)
    for (const row of data ?? []) gameIdByApp.set(Number(row.external_id), row.game_id)
  }
  return gameIdByApp
}

/** Cuándo se revisaron por última vez los logros de cada juego (por AppID). */
function syncedAtByApp(owned: OwnedGame[], gameIdByApp: Map<number, number>, have: Map<number, string | null>) {
  return new Map(
    owned.filter((g) => gameIdByApp.has(g.appid)).map((g) => {
      const at = have.get(gameIdByApp.get(g.appid)!)
      return [g.appid, at ? new Date(at) : null] as const
    }),
  )
}

async function importGames(admin: SupabaseClient, userId: string, owned: OwnedGame[]) {
  const now = new Date()
  const gameIdByApp = await gameIdsByApp(admin, owned)

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

  return { gameIdByApp, added: fresh.length, syncedAt: syncedAtByApp(owned, gameIdByApp, have) }
}

/** Para continuar una sincronización: los ids de Pulso de los juegos y cuándo se revisaron sus logros. */
async function knownGames(admin: SupabaseClient, userId: string, owned: OwnedGame[]) {
  const gameIdByApp = await gameIdsByApp(admin, owned)
  const { data } = await admin.from('user_games').select('game_id, achievements_synced_at').eq('user_id', userId)
  const have = new Map((data ?? []).map((r) => [r.game_id as number, r.achievements_synced_at as string | null]))
  // Un juego comprado a mitad de la sincronización aún no tiene id: entra en la próxima.
  const ready = owned.filter((g) => gameIdByApp.has(g.appid))
  return { gameIdByApp, added: 0, owned: ready, syncedAt: syncedAtByApp(ready, gameIdByApp, have) }
}

/** Lista de logros del juego (nombres, iconos, rareza) desde Steam, guardada para todos los jugadores. */
async function loadSchema(admin: SupabaseClient, game: OwnedGame, gameId: number) {
  const [schema, global] = await Promise.all([
    steam('ISteamUserStats/GetSchemaForGame/v2/', { appid: game.appid, l: 'spanish' }),
    steam('ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/', { gameid: game.appid }),
  ])
  const rows = mapSchema(gameId, schema, global)
  if (!rows.length) return []
  await admin.from('achievements').upsert(rows, { onConflict: 'game_id,source,api_name' })
  const { data } = await admin.from('achievements').select('id, api_name').eq('game_id', gameId)
  return data ?? []
}

async function syncAchievements(admin: SupabaseClient, userId: string, steamId: string, games: OwnedGame[], gameIdByApp: Map<number, number>) {
  let unlocked = 0
  await pool(games, 6, async (game) => {
    const gameId = gameIdByApp.get(game.appid)!
    let { data: known } = await admin.from('achievements').select('id, api_name').eq('game_id', gameId)
    if (!known?.length) known = await loadSchema(admin, game, gameId)
    if (known?.length) {
      const player = await steam('ISteamUserStats/GetPlayerAchievements/v1/', { steamid: steamId, appid: game.appid })
      // El juego ha añadido logros (un DLC, una actualización) desde que se guardó su lista: se relee.
      if (hasUnknownAchievements(player, new Set(known.map((a) => a.api_name as string)))) {
        known = await loadSchema(admin, game, gameId)
      }
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

  const body = (await req.json().catch(() => ({}))) as { run?: unknown }
  const continuing = typeof body?.run === 'string' ? body.run : null
  const now = new Date()

  let run: { id: string; started_at: string }
  if (continuing) {
    const { data } = await admin.from('sync_runs').select('id, user_id, status, started_at').eq('id', continuing).maybeSingle()
    if (!canContinueRun(data, user.id, now)) return json({ error: 'run_expired' }, 409)
    run = data!
  } else {
    const { data: last } = await admin
      .from('sync_runs')
      .select('started_at')
      .eq('user_id', user.id)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const wait = syncCooldown(last ? new Date(last.started_at) : null, now)
    if (wait > 0) return json({ error: 'cooldown', retry_after: wait }, 429)
    // Una sincronización anterior que se quedó a medias (se cerró la app) ya no va a continuar.
    await admin
      .from('sync_runs')
      .update({ status: 'error', error: 'interrupted', finished_at: now.toISOString() })
      .eq('user_id', user.id)
      .eq('status', 'running')
    const { data } = await admin.from('sync_runs').insert({ user_id: user.id, platform: 'steam' }).select('id, started_at').single()
    run = data!
  }
  const finish = (status: 'ok' | 'error', error: string | null = null) =>
    admin.from('sync_runs').update({ status, error, finished_at: new Date().toISOString() }).eq('id', run.id)

  try {
    if (!continuing) {
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
    }

    const parsed = parseOwnedGames(
      await steam('IPlayerService/GetOwnedGames/v1/', { steamid: steamId, include_appinfo: 1, include_played_free_games: 1 }),
    )
    if (!parsed.ok) throw new SyncError(parsed.error)

    // La biblioteca y las horas, completas, al empezar; en las tandas siguientes basta con saber los ids.
    let owned = parsed.games
    let state
    if (continuing) {
      const known = await knownGames(admin, user.id, owned)
      owned = known.owned
      state = known
    } else {
      state = await importGames(admin, user.id, owned)
    }
    const { batch, total, remaining } = nextAchievementBatch(owned, state.syncedAt, new Date(run.started_at))
    const unlocked = await syncAchievements(admin, user.id, steamId, batch, state.gameIdByApp)

    if (remaining === 0) {
      await admin
        .from('linked_accounts')
        .update({ last_synced_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('platform', 'steam')
      await finish('ok')
    }
    return json({
      run: run.id,
      games: parsed.games.length,
      added: state.added,
      achievementGames: total,
      checked: total - remaining,
      remaining,
      unlocked,
    })
  } catch (err) {
    const code = err instanceof SyncError ? err.code : 'server_error'
    // Solo el código: nunca datos del usuario en los logs.
    console.error('steam-sync', code, err instanceof SyncError ? '' : err instanceof Error ? err.message : '')
    await finish('error', code)
    return json({ error: code }, err instanceof SyncError ? 422 : 500)
  }
})
