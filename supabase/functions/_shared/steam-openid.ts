// Login con Steam por OpenID 2.0. Sin dependencias: corre en Deno (Edge Function) y en Node (tests).
// https://steamcommunity.com/dev — Steam solo ofrece OpenID; nunca se ve la contraseña del usuario.

export const STEAM_OPENID_ENDPOINT = 'https://steamcommunity.com/openid/login'
const OPENID_NS = 'http://specs.openid.net/auth/2.0'
const IDENTIFIER_SELECT = 'http://specs.openid.net/auth/2.0/identifier_select'
const CLAIMED_ID = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/
const REQUIRED_SIGNED = ['op_endpoint', 'claimed_id', 'identity', 'return_to', 'response_nonce', 'assoc_handle']

export function buildSteamLoginUrl(returnTo: string): string {
  const params = new URLSearchParams({
    'openid.ns': OPENID_NS,
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnTo,
    'openid.realm': new URL(returnTo).origin,
    'openid.identity': IDENTIFIER_SELECT,
    'openid.claimed_id': IDENTIFIER_SELECT,
  })
  return `${STEAM_OPENID_ENDPOINT}?${params}`
}

/**
 * Comprueba con Steam que la respuesta del login es auténtica.
 * Devuelve el SteamID64 o null; nunca se fía de los parámetros sin la confirmación de Steam.
 */
export async function verifySteamAssertion(
  params: URLSearchParams,
  expectedReturnTo: string,
  fetchFn: typeof fetch,
): Promise<string | null> {
  if (params.get('openid.mode') !== 'id_res') return null
  if (params.get('openid.op_endpoint') !== STEAM_OPENID_ENDPOINT) return null
  if (params.get('openid.return_to') !== expectedReturnTo) return null

  const claimed = params.get('openid.claimed_id') ?? ''
  const match = CLAIMED_ID.exec(claimed)
  if (!match || params.get('openid.identity') !== claimed) return null

  const signed = (params.get('openid.signed') ?? '').split(',')
  if (!REQUIRED_SIGNED.every((field) => signed.includes(field))) return null

  const check = new URLSearchParams()
  for (const [key, value] of params) if (key.startsWith('openid.')) check.set(key, value)
  check.set('openid.mode', 'check_authentication')

  try {
    const res = await fetchFn(STEAM_OPENID_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: check.toString(),
    })
    if (!res.ok) return null
    const body = await res.text()
    return /^is_valid:true$/m.test(body) ? match[1]! : null
  } catch {
    return null
  }
}
