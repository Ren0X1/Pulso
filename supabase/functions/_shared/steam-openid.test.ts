import { describe, expect, it, vi } from 'vitest'
import { STEAM_OPENID_ENDPOINT, buildSteamLoginUrl, verifySteamAssertion } from './steam-openid.ts'
import { buildCallbackUrl, finalRedirect, isValidState } from './redirect.ts'

const FUNCTION_URL = 'https://abc.supabase.co/functions/v1/auth-steam'
const STATE = 'aaaaaaaaaaaaaaaaaaaaaaaa'
const RETURN_TO = buildCallbackUrl(FUNCTION_URL, 'web', STATE)
const STEAM_ID = '76561198000000000'

function steamResponse(overrides: Record<string, string> = {}): URLSearchParams {
  return new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'id_res',
    'openid.op_endpoint': STEAM_OPENID_ENDPOINT,
    'openid.claimed_id': `https://steamcommunity.com/openid/id/${STEAM_ID}`,
    'openid.identity': `https://steamcommunity.com/openid/id/${STEAM_ID}`,
    'openid.return_to': RETURN_TO,
    'openid.response_nonce': '2026-10-22T18:00:00Zabc',
    'openid.assoc_handle': '1234567890',
    'openid.signed': 'signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle',
    'openid.sig': 'c2lnbmF0dXJl',
    ...overrides,
  })
}

const steamSays = (body: string) =>
  vi.fn<typeof fetch>(async () => new Response(`ns:http://specs.openid.net/auth/2.0\n${body}\n`))

describe('buildSteamLoginUrl', () => {
  it('pide a Steam que elija la identidad y vuelva a nuestra función', () => {
    const url = new URL(buildSteamLoginUrl(RETURN_TO))
    expect(url.origin + url.pathname).toBe(STEAM_OPENID_ENDPOINT)
    expect(url.searchParams.get('openid.ns')).toBe('http://specs.openid.net/auth/2.0')
    expect(url.searchParams.get('openid.mode')).toBe('checkid_setup')
    expect(url.searchParams.get('openid.identity')).toBe('http://specs.openid.net/auth/2.0/identifier_select')
    expect(url.searchParams.get('openid.claimed_id')).toBe('http://specs.openid.net/auth/2.0/identifier_select')
    expect(url.searchParams.get('openid.return_to')).toBe(RETURN_TO)
    expect(url.searchParams.get('openid.realm')).toBe('https://abc.supabase.co')
  })
})

describe('verifySteamAssertion', () => {
  it('devuelve el SteamID64 si Steam confirma la firma', async () => {
    const fetchFn = steamSays('is_valid:true')
    expect(await verifySteamAssertion(steamResponse(), RETURN_TO, fetchFn)).toBe(STEAM_ID)
    const [url, init] = fetchFn.mock.calls[0]!
    expect(url).toBe(STEAM_OPENID_ENDPOINT)
    expect(init?.method).toBe('POST')
    const sent = new URLSearchParams(String(init?.body))
    expect(sent.get('openid.mode')).toBe('check_authentication')
    expect(sent.get('openid.sig')).toBe('c2lnbmF0dXJl')
  })

  it('rechaza si Steam dice que la firma no es válida', async () => {
    expect(await verifySteamAssertion(steamResponse(), RETURN_TO, steamSays('is_valid:false'))).toBeNull()
  })

  it('rechaza si Steam no responde bien', async () => {
    const down = vi.fn<typeof fetch>(async () => new Response('error', { status: 503 }))
    expect(await verifySteamAssertion(steamResponse(), RETURN_TO, down)).toBeNull()
  })

  it('rechaza un proveedor que no es Steam sin llegar a consultarlo', async () => {
    const fetchFn = steamSays('is_valid:true')
    const params = steamResponse({ 'openid.op_endpoint': 'https://evil.example/openid/login' })
    expect(await verifySteamAssertion(params, RETURN_TO, fetchFn)).toBeNull()
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it.each([
    'https://steamcommunity.com/openid/id/123',
    'https://steamcommunity.com/openid/id/76561198000000000/extra',
    'https://evil.example/openid/id/76561198000000000',
    'http://steamcommunity.com/openid/id/76561198000000000',
  ])('rechaza un claimed_id con formato inválido: %s', async (claimed) => {
    const fetchFn = steamSays('is_valid:true')
    const params = steamResponse({ 'openid.claimed_id': claimed, 'openid.identity': claimed })
    expect(await verifySteamAssertion(params, RETURN_TO, fetchFn)).toBeNull()
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('rechaza si identity y claimed_id no coinciden', async () => {
    const params = steamResponse({ 'openid.identity': 'https://steamcommunity.com/openid/id/76561198000000001' })
    expect(await verifySteamAssertion(params, RETURN_TO, steamSays('is_valid:true'))).toBeNull()
  })

  it('rechaza un return_to distinto del esperado', async () => {
    const other = buildCallbackUrl(FUNCTION_URL, 'web', 'bbbbbbbbbbbbbbbbbbbbbbbb')
    const params = steamResponse({ 'openid.return_to': other })
    expect(await verifySteamAssertion(params, RETURN_TO, steamSays('is_valid:true'))).toBeNull()
  })

  it('rechaza si el modo no es id_res (p. ej. el usuario canceló)', async () => {
    const params = steamResponse({ 'openid.mode': 'cancel' })
    expect(await verifySteamAssertion(params, RETURN_TO, steamSays('is_valid:true'))).toBeNull()
  })

  it('rechaza si el return_to no está entre los campos firmados', async () => {
    const params = steamResponse({ 'openid.signed': 'signed,op_endpoint,claimed_id,identity' })
    expect(await verifySteamAssertion(params, RETURN_TO, steamSays('is_valid:true'))).toBeNull()
  })
})

describe('redirecciones', () => {
  const tokens = { access_token: 'acc', refresh_token: 'ref' }

  it('la web vuelve a /auth/callback con los tokens en el fragmento', () => {
    const url = finalRedirect('web', 'https://pulso.pages.dev', tokens, STATE)
    expect(url.startsWith('https://pulso.pages.dev/auth/callback#')).toBe(true)
    const hash = new URLSearchParams(url.split('#')[1])
    expect(hash.get('access_token')).toBe('acc')
    expect(hash.get('refresh_token')).toBe('ref')
    expect(hash.get('state')).toBe(STATE)
  })

  it('el escritorio vuelve por el enlace pulso://', () => {
    expect(finalRedirect('desktop', 'https://pulso.pages.dev', tokens, STATE).startsWith('pulso://auth/callback#')).toBe(true)
  })

  it('el destino web sale de la configuración aunque acabe en barra', () => {
    expect(finalRedirect('web', 'https://pulso.pages.dev/', tokens, STATE).startsWith('https://pulso.pages.dev/auth/callback#')).toBe(true)
  })

  it('el callback lleva cliente y state, y nada más', () => {
    const url = new URL(RETURN_TO)
    expect([...url.searchParams.keys()].sort()).toEqual(['action', 'client', 'state'])
  })

  it('solo acepta states aleatorios de longitud razonable', () => {
    expect(isValidState(STATE)).toBe(true)
    expect(isValidState('corto')).toBe(false)
    expect(isValidState('a'.repeat(200))).toBe(false)
    expect(isValidState('aaaaaaaaaaaaaaaa<script>')).toBe(false)
    expect(isValidState(null)).toBe(false)
  })
})
