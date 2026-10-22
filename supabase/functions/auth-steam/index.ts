// Edge Function: login con Steam.
//   GET ?action=start&client=web|desktop&state=…   → redirige a Steam
//   GET ?action=callback&client=…&state=…&openid.* → verifica, crea la cuenta si hace falta y devuelve la sesión
// La lógica que decide si un login es válido está en _shared y tiene tests.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0'
import { buildSteamLoginUrl, verifySteamAssertion } from '../_shared/steam-openid.ts'
import { buildCallbackUrl, errorRedirect, finalRedirect, isLoginClient, isValidState } from '../_shared/redirect.ts'
import { suggestUsername } from '../../../packages/core/src/username.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const STEAM_API_KEY = Deno.env.get('STEAM_API_KEY') ?? ''
const APP_URL = Deno.env.get('PULSO_APP_URL')!
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/auth-steam`

interface SteamPlayer {
  personaname: string
  avatarfull?: string
  communityvisibilitystate?: number
}

const redirect = (location: string) => new Response(null, { status: 302, headers: { location } })

async function fetchPlayer(steamId: string): Promise<SteamPlayer | null> {
  if (!STEAM_API_KEY) return null
  try {
    const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM_API_KEY}&steamids=${steamId}`
    const res = await fetch(url)
    if (!res.ok) return null
    const body = (await res.json()) as { response?: { players?: SteamPlayer[] } }
    return body.response?.players?.[0] ?? null
  } catch {
    return null
  }
}

async function createProfile(admin: SupabaseClient, userId: string, steamId: string, player: SteamPlayer | null) {
  const persona = player?.personaname ?? ''
  const preferred = suggestUsername(persona, steamId, () => false)
  const { data: similar } = await admin.from('profiles').select('username').like('username', `${preferred}%`)
  const taken = new Set((similar ?? []).map((row: { username: string }) => row.username))
  const username = suggestUsername(persona, steamId, (u) => taken.has(u))

  const { error } = await admin
    .from('profiles')
    .insert({ id: userId, username, avatar_url: player?.avatarfull ?? null })
  if (error) throw new Error(`profile: ${error.code}`)
}

async function upsertSteamAccount(admin: SupabaseClient, userId: string, steamId: string, player: SteamPlayer | null) {
  const { error } = await admin.from('linked_accounts').upsert({
    user_id: userId,
    platform: 'steam',
    external_user_id: steamId,
    display_name: player?.personaname ?? null,
    avatar_url: player?.avatarfull ?? null,
    profile_visibility: player ? (player.communityvisibilitystate === 3 ? 'public' : 'private') : null,
  })
  if (error) throw new Error(`linked_accounts: ${error.code}`)
}

async function signIn(steamId: string) {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // generateLink crea el usuario de Auth si no existe; el email es sintético y nunca recibe correos.
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: `${steamId}@steam.pulso.invalid`,
  })
  if (linkError || !link.user) throw new Error(`generateLink: ${linkError?.code ?? 'sin usuario'}`)
  const userId = link.user.id

  const player = await fetchPlayer(steamId)
  const { data: profile } = await admin.from('profiles').select('id').eq('id', userId).maybeSingle()
  if (!profile) await createProfile(admin, userId, steamId, player)
  await upsertSteamAccount(admin, userId, steamId, player)

  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'email' })
  if (error || !data.session) throw new Error(`verifyOtp: ${error?.code ?? 'sin sesión'}`)
  return { access_token: data.session.access_token, refresh_token: data.session.refresh_token }
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const action = url.searchParams.get('action')
  const client = url.searchParams.get('client')
  const state = url.searchParams.get('state')

  if (!isLoginClient(client) || !isValidState(state)) {
    return new Response('Petición de login no válida', { status: 400 })
  }
  const returnTo = buildCallbackUrl(FUNCTION_URL, client, state)

  if (action === 'start') return redirect(buildSteamLoginUrl(returnTo))
  if (action !== 'callback') return new Response('Acción desconocida', { status: 400 })

  const steamId = await verifySteamAssertion(url.searchParams, returnTo, fetch)
  if (!steamId) return redirect(errorRedirect(client, APP_URL, 'steam_rejected'))

  try {
    return redirect(finalRedirect(client, APP_URL, await signIn(steamId), state))
  } catch (err) {
    // Solo el mensaje: nunca tokens ni datos del usuario en los logs.
    console.error('auth-steam', err instanceof Error ? err.message : 'error desconocido')
    return redirect(errorRedirect(client, APP_URL, 'server_error'))
  }
})
