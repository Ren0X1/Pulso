// Edge Function: importar de Steam la biblioteca, las horas y los logros del usuario.
// Una sincronización revisa los logros de TODOS los juegos, en tandas: cada tanda es una llamada a esta misma
// función (con su propio tiempo límite) y, al acabar, lanza la siguiente. Avanza sola en el servidor aunque
// se cierre la web; el progreso queda en sync_runs y la web lo sigue en directo.
//   POST {}                       → empieza (una cada 10 min) · 202 { run }
//   POST { run }                  → si esa sincronización tuya está atascada, relanza su tanda · 202 { run }
//   interna { user, forcedBy }    → la fuerza un administrador, sin esperar · 202 { run }
//   interna { run, step }         → procesa la tanda `step` · 202
// Errores: 401 not_signed_in · 400 no_steam_account · 429 { error: 'cooldown', retry_after } · 409 run_expired
// La lógica que decide qué importar está en _shared/steam.ts y tiene tests.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0'
import {
  achievementsPrivate,
  becamePlatinum,
  hasUnknownAchievements,
  hiddenForWholeAccount,
  initialStatus,
  mapSchema,
  mapUnlocked,
  nextAchievementBatch,
  parseOwnedGames,
  runState,
  steamCoverUrl,
  syncCooldown,
  type OwnedGame,
  type SteamSyncError,
} from '../_shared/steam.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const STEAM_API_KEY = Deno.env.get('STEAM_API_KEY') ?? ''
const API = 'https://api.steampowered.com'
// Las llamadas internas (la tanda siguiente, el panel de administración) se firman con la clave de servicio.
const INTERNAL_HEADER = 'x-pulso-internal'
const SELF_URL = `${SUPABASE_URL}/functions/v1/steam-sync`

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void }

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
  if (res.status === 400 || res.status === 403) {
    // Los detalles de juego no son públicos: no se verá ningún logro, así que se avisa en vez de seguir a ciegas.
    if (achievementsPrivate(await res.json().catch(() => null))) throw new SyncError('achievements_private')
    return null
  }
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
      .upsert(part.map((g) => ({ slug: `steam-${g.appid}`, name: g.name || `Juego de Steam ${g.appid}`, cover_url: steamCoverUrl(g.appid) })), { onConflict: 'slug' })
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
  let read = 0
  let hidden = 0
  await pool(games, 6, async (game) => {
    const gameId = gameIdByApp.get(game.appid)!
    let { data: known } = await admin.from('achievements').select('id, api_name').eq('game_id', gameId)
    if (!known?.length) known = await loadSchema(admin, game, gameId)
    if (known?.length) {
      let player: unknown
      try {
        player = await steam('ISteamUserStats/GetPlayerAchievements/v1/', { steamid: steamId, appid: game.appid })
        read++
      } catch (err) {
        if (!(err instanceof SyncError && err.code === 'achievements_private')) throw err
        // Steam oculta los logros de este juego (marcado como privado en la biblioteca, o ya no es suyo): se salta.
        hidden++
        player = null
      }
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
  return { unlocked, read, hidden }
}

interface RunRow {
  id: number
  user_id: string
  started_at: string
  added: number
  unlocked: number
  read_games: number
  hidden_games: number
}

async function steamIdOf(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await admin
    .from('linked_accounts')
    .select('external_user_id')
    .eq('user_id', userId)
    .eq('platform', 'steam')
    .maybeSingle()
  return (data?.external_user_id as string | undefined) ?? null
}

/** Una tanda: la primera importa también el perfil, la biblioteca y las horas. */
async function runBatch(admin: SupabaseClient, run: RunRow, first: boolean) {
  const steamId = await steamIdOf(admin, run.user_id)
  if (!steamId) throw new Error('no_steam_account')

  if (first) {
    const summary = (await steam('ISteamUser/GetPlayerSummaries/v2/', { steamids: steamId })) as {
      response?: { players?: { personaname: string; avatarfull?: string; communityvisibilitystate?: number }[] }
    } | null
    const player = summary?.response?.players?.[0]
    if (!player) throw new SyncError('steam_unavailable')
    const visible = player.communityvisibilitystate === 3
    await admin
      .from('linked_accounts')
      .update({ display_name: player.personaname, avatar_url: player.avatarfull ?? null, profile_visibility: visible ? 'public' : 'private' })
      .eq('user_id', run.user_id)
      .eq('platform', 'steam')
    if (!visible) throw new SyncError('profile_private')
  }

  // Con los gratuitos y los retirados de la tienda: Steam los esconde por defecto y también tienen logros.
  const parsed = parseOwnedGames(
    await steam('IPlayerService/GetOwnedGames/v1/', { steamid: steamId, include_appinfo: 1, include_played_free_games: 1, include_free_sub: 1, skip_unvetted_apps: 0 }),
  )
  if (!parsed.ok) throw new SyncError(parsed.error)

  // La biblioteca y las horas, completas, en la primera tanda; en las siguientes basta con saber los ids.
  let owned = parsed.games
  let state
  if (first) {
    state = await importGames(admin, run.user_id, owned)
  } else {
    const known = await knownGames(admin, run.user_id, owned)
    owned = known.owned
    state = known
  }
  const { batch, total, remaining } = nextAchievementBatch(owned, state.syncedAt, new Date(run.started_at))
  const { unlocked, read, hidden } = await syncAchievements(admin, run.user_id, steamId, batch, state.gameIdByApp)
  // Si Steam no deja ver los logros de ningún juego, son los detalles de juego de la cuenta: se dice qué cambiar.
  if (hiddenForWholeAccount(run.read_games + read, run.hidden_games + hidden)) throw new SyncError('achievements_private')
  return { games: parsed.games.length, added: state.added, total, checked: total - remaining, remaining, unlocked, read, hidden }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Pide a esta misma función la tanda siguiente; solo espera a que la acepte, no a que termine. */
async function chain(runId: number, step: number) {
  const res = await fetch(SELF_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      [INTERNAL_HEADER]: SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({ run: runId, step }),
  })
  await res.body?.cancel()
  if (!res.ok) throw new Error(`chain ${res.status}`)
}

/** Procesa la tanda `step` de una sincronización (si nadie la ha cogido ya) y lanza la siguiente. */
async function processStep(admin: SupabaseClient, runId: number, step: number) {
  // Reclamar la tanda: si otra llamada ya la cogió o la sincronización terminó, no hay nada que hacer.
  const { data: run } = await admin
    .from('sync_runs')
    .update({ step: step + 1, updated_at: new Date().toISOString() })
    .eq('id', runId)
    .eq('status', 'running')
    .eq('step', step)
    .select('id, user_id, started_at, added, unlocked, games, read_games, hidden_games')
    .maybeSingle()
  if (!run) return

  try {
    let result
    // Steam falla a veces de forma pasajera: hasta 3 intentos antes de dar la sincronización por fallida.
    for (let attempt = 1; ; attempt++) {
      try {
        // Hasta que una tanda no termina bien, la biblioteca no está importada: esa tanda la importa.
        result = await runBatch(admin, run as RunRow, run.games === null)
        break
      } catch (err) {
        const permanent = err instanceof SyncError && err.code !== 'steam_unavailable'
        if (permanent || attempt === 3) throw err
        await wait(attempt * 3000)
      }
    }
    const now = new Date().toISOString()
    const done = result.remaining === 0
    await admin
      .from('sync_runs')
      .update({
        games: result.games,
        added: run.added + result.added,
        total: result.total,
        checked: result.checked,
        unlocked: run.unlocked + result.unlocked,
        read_games: run.read_games + result.read,
        hidden_games: run.hidden_games + result.hidden,
        updated_at: now,
        ...(done ? { status: 'ok', finished_at: now } : {}),
      })
      .eq('id', runId)
    if (done) {
      await admin.from('linked_accounts').update({ last_synced_at: now }).eq('user_id', run.user_id).eq('platform', 'steam')
      return
    }
    // Si la llamada a la tanda siguiente falla dos veces, la sincronización queda "atascada" y la web la relanza.
    await chain(runId, step + 1).catch(() => chain(runId, step + 1)).catch(() => {})
  } catch (err) {
    const code = err instanceof SyncError ? err.code : 'server_error'
    // Solo el código: nunca datos del usuario en los logs.
    console.error('steam-sync', code, err instanceof SyncError ? '' : err instanceof Error ? err.message : '')
    await admin.from('sync_runs').update({ status: 'error', error: code, finished_at: new Date().toISOString() }).eq('id', runId)
  }
}

/** Empieza una sincronización nueva (la que estuviera a medias se da por interrumpida). */
async function startRun(admin: SupabaseClient, userId: string, forcedBy: string | null) {
  await admin
    .from('sync_runs')
    .update({ status: 'error', error: 'interrupted', finished_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('status', 'running')
  const { data, error } = await admin
    .from('sync_runs')
    .insert({ user_id: userId, platform: 'steam', forced_by: forcedBy })
    .select('id')
    .single()
  if (error) throw new Error(`sync_runs: ${error.code}`)
  EdgeRuntime.waitUntil(processStep(admin, data.id as number, 0))
  return data.id as number
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const body = (await req.json().catch(() => ({}))) as { run?: unknown; step?: unknown; user?: unknown; forcedBy?: unknown }
  const runId = typeof body?.run === 'number' ? body.run : null

  // Llamadas internas: la tanda siguiente, o una sincronización forzada desde el panel de administración.
  if (req.headers.get(INTERNAL_HEADER) === SERVICE_ROLE_KEY) {
    if (typeof body.user === 'string') {
      if (!(await steamIdOf(admin, body.user))) return json({ error: 'no_steam_account' }, 400)
      return json({ run: await startRun(admin, body.user, typeof body.forcedBy === 'string' ? body.forcedBy : null) }, 202)
    }
    if (runId !== null && typeof body.step === 'number') {
      EdgeRuntime.waitUntil(processStep(admin, runId, body.step))
      return json({ run: runId }, 202)
    }
    return json({ error: 'bad_request' }, 400)
  }

  const jwt = req.headers.get('authorization')?.replace(/^Bearer /i, '') ?? ''
  const { data: auth } = await admin.auth.getUser(jwt)
  const user = auth.user
  if (!user) return json({ error: 'not_signed_in' }, 401)

  // Una sincronización tuya que lleva rato sin avanzar (se perdió una tanda): se relanza esa tanda.
  if (runId !== null) {
    const { data: run } = await admin.from('sync_runs').select('id, user_id, status, updated_at, step').eq('id', runId).maybeSingle()
    if (!run || run.user_id !== user.id) return json({ error: 'run_expired' }, 409)
    const state = runState(run, new Date())
    if (state === 'expired') {
      await admin.from('sync_runs').update({ status: 'error', error: 'interrupted', finished_at: new Date().toISOString() }).eq('id', runId)
      return json({ error: 'run_expired' }, 409)
    }
    if (state === 'stalled') EdgeRuntime.waitUntil(processStep(admin, runId, run.step as number))
    return json({ run: runId }, 202)
  }

  if (!(await steamIdOf(admin, user.id))) return json({ error: 'no_steam_account' }, 400)
  const { data: last } = await admin
    .from('sync_runs')
    .select('started_at')
    .eq('user_id', user.id)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const retry = syncCooldown(last ? new Date(last.started_at) : null, new Date())
  if (retry > 0) return json({ error: 'cooldown', retry_after: retry }, 429)
  return json({ run: await startRun(admin, user.id, null) }, 202)
})
