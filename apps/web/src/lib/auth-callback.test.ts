import { describe, expect, it } from 'vitest'
import { newLoginState, parseAuthCallback } from './auth-callback.ts'

const STATE = 'aaaaaaaaaaaaaaaaaaaaaaaa'
const hash = (params: Record<string, string>) => `#${new URLSearchParams(params)}`

describe('parseAuthCallback', () => {
  it('acepta los tokens si el state coincide', () => {
    expect(parseAuthCallback(hash({ access_token: 'acc', refresh_token: 'ref', state: STATE }), STATE)).toEqual({
      ok: true,
      access_token: 'acc',
      refresh_token: 'ref',
    })
  })

  it('funciona también sin la almohadilla inicial', () => {
    const result = parseAuthCallback(`access_token=acc&refresh_token=ref&state=${STATE}`, STATE)
    expect(result.ok).toBe(true)
  })

  it('rechaza un state distinto: alguien intenta colar su sesión', () => {
    const result = parseAuthCallback(hash({ access_token: 'acc', refresh_token: 'ref', state: 'otro_state_cualquiera' }), STATE)
    expect(result).toEqual({ ok: false, error: 'state_mismatch' })
  })

  it('rechaza si este navegador no inició ningún login', () => {
    const result = parseAuthCallback(hash({ access_token: 'acc', refresh_token: 'ref', state: STATE }), null)
    expect(result).toEqual({ ok: false, error: 'state_mismatch' })
  })

  it('rechaza si falta un token', () => {
    expect(parseAuthCallback(hash({ access_token: 'acc', state: STATE }), STATE)).toEqual({
      ok: false,
      error: 'missing_tokens',
    })
  })

  it('traslada el error que devuelve el servidor', () => {
    expect(parseAuthCallback(hash({ error: 'steam_rejected' }), STATE)).toEqual({
      ok: false,
      error: 'login_failed',
      code: 'steam_rejected',
    })
  })
})

describe('newLoginState', () => {
  it('genera states distintos y con el formato que acepta el servidor', () => {
    const a = newLoginState()
    const b = newLoginState()
    expect(a).not.toBe(b)
    expect(a).toMatch(/^[A-Za-z0-9_-]{32,128}$/)
  })
})
