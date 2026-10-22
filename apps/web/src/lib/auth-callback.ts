// Vuelta del login con Steam. La Edge Function deja los tokens en el fragmento (#), que no viaja a
// ningún servidor. Solo se aceptan si el state coincide con el que este navegador generó al salir.

export type AuthCallbackResult =
  | { ok: true; access_token: string; refresh_token: string }
  | { ok: false; error: 'state_mismatch' | 'missing_tokens' }
  | { ok: false; error: 'login_failed'; code: string }

export function parseAuthCallback(hash: string, expectedState: string | null): AuthCallbackResult {
  const params = new URLSearchParams(hash.replace(/^#/, ''))

  const serverError = params.get('error')
  if (serverError) return { ok: false, error: 'login_failed', code: serverError }

  const state = params.get('state')
  if (!expectedState || state !== expectedState) return { ok: false, error: 'state_mismatch' }

  const access_token = params.get('access_token')
  const refresh_token = params.get('refresh_token')
  if (!access_token || !refresh_token) return { ok: false, error: 'missing_tokens' }

  return { ok: true, access_token, refresh_token }
}

/** 32 bytes aleatorios en base64url. */
export function newLoginState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export const LOGIN_ERRORS: Record<string, string> = {
  state_mismatch: 'El inicio de sesión no lo empezaste desde aquí. Vuelve a intentarlo.',
  missing_tokens: 'Steam no completó el inicio de sesión. Vuelve a intentarlo.',
  steam_rejected: 'Steam no confirmó tu identidad. Vuelve a intentarlo.',
  server_error: 'Pulso no pudo crear tu sesión. Inténtalo de nuevo en un momento.',
}
