import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { ProfileLink } from './profile.ts'
import { newLoginState, parseAuthCallback, type AuthCallbackResult } from './auth-callback.ts'
import { isDesktop, loginClient } from './platform.ts'
import { steamLoginUrl, supabase } from './supabase.ts'

export const PROFILE_COLUMNS = 'id, username, avatar_url, banner_url, bio, created_at, links, favorite_game_ids'

export interface Profile {
  id: string
  username: string
  avatar_url: string | null
  banner_url: string | null
  bio: string
  created_at: string
  links: ProfileLink[]
  favorite_game_ids: number[]
}

type AuthState =
  | { status: 'unconfigured' }
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; session: Session; profile: Profile | null }

interface AuthContextValue {
  state: AuthState
  startLogin: () => Promise<void>
  completeLogin: (hash: string) => Promise<AuthCallbackResult>
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

const STATE_KEY = 'pulso.login_state'
const DESKTOP_CALLBACK = 'pulso://auth/callback'

export const AuthContext = createContext<AuthContextValue | null>(null)

async function loadProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase!
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', userId)
    .maybeSingle()
  return (data as Profile | null) ?? null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(supabase ? { status: 'loading' } : { status: 'unconfigured' })

  const applySession = useCallback(async (session: Session | null) => {
    if (!session) return setState({ status: 'signed-out' })
    setState({ status: 'signed-in', session, profile: await loadProfile(session.user.id) })
  }, [])

  useEffect(() => {
    if (!supabase) return
    void supabase.auth.getSession().then(({ data }) => applySession(data.session))
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') void applySession(session)
    })
    return () => data.subscription.unsubscribe()
  }, [applySession])

  const completeLogin = useCallback(async (hash: string): Promise<AuthCallbackResult> => {
    const result = parseAuthCallback(hash, sessionStorage.getItem(STATE_KEY))
    sessionStorage.removeItem(STATE_KEY)
    if (result.ok && supabase) {
      const { error } = await supabase.auth.setSession(result)
      if (error) return { ok: false, error: 'login_failed', code: 'server_error' }
    }
    return result
  }, [])

  // En el launcher, Steam devuelve al usuario por el enlace pulso://auth/callback#…
  useEffect(() => {
    if (!isDesktop()) return
    let unlisten: (() => void) | undefined
    void import('@tauri-apps/plugin-deep-link').then(async ({ onOpenUrl }) => {
      unlisten = await onOpenUrl((urls) => {
        const url = urls.find((u) => u.startsWith(DESKTOP_CALLBACK))
        if (url) void completeLogin(url.slice(url.indexOf('#')))
      })
    })
    return () => unlisten?.()
  }, [completeLogin])

  const startLogin = useCallback(async () => {
    const loginState = newLoginState()
    sessionStorage.setItem(STATE_KEY, loginState)
    const url = steamLoginUrl(loginClient(), loginState)
    if (isDesktop()) {
      const { openUrl } = await import('@tauri-apps/plugin-opener')
      await openUrl(url)
    } else {
      window.location.assign(url)
    }
  }, [])

  const refreshProfile = useCallback(async () => {
    if (state.status !== 'signed-in') return
    const profile = await loadProfile(state.session.user.id)
    setState({ ...state, profile })
  }, [state])

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut()
  }, [])

  const value = useMemo(
    () => ({ state, startLogin, completeLogin, refreshProfile, signOut }),
    [state, startLogin, completeLogin, refreshProfile, signOut],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth fuera de <AuthProvider>')
  return ctx
}
