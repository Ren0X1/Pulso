// Adónde vuelve el usuario tras el login. El destino sale siempre de la configuración del servidor,
// nunca de la petición, para que nadie pueda usar el login para redirigir a otro dominio.

export type LoginClient = 'web' | 'desktop'

export const DESKTOP_CALLBACK = 'pulso://auth/callback'
const STATE_PATTERN = /^[A-Za-z0-9_-]{16,128}$/

export function isValidState(state: string | null): state is string {
  return state !== null && STATE_PATTERN.test(state)
}

export function isLoginClient(value: string | null): value is LoginClient {
  return value === 'web' || value === 'desktop'
}

export function buildCallbackUrl(functionUrl: string, client: LoginClient, state: string): string {
  const params = new URLSearchParams({ action: 'callback', client, state })
  return `${functionUrl}?${params}`
}

export function finalRedirect(
  client: LoginClient,
  appUrl: string,
  tokens: { access_token: string; refresh_token: string },
  state: string,
): string {
  const base = client === 'desktop' ? DESKTOP_CALLBACK : `${appUrl.replace(/\/+$/, '')}/auth/callback`
  const fragment = new URLSearchParams({ ...tokens, state })
  return `${base}#${fragment}`
}

export function errorRedirect(client: LoginClient, appUrl: string, code: string): string {
  const base = client === 'desktop' ? DESKTOP_CALLBACK : `${appUrl.replace(/\/+$/, '')}/auth/callback`
  return `${base}#${new URLSearchParams({ error: code })}`
}
