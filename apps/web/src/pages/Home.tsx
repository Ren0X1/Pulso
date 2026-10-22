import { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { Avatar } from '@pulso/ui'
import { useAuth } from '../lib/auth.tsx'
import { supabase } from '../lib/supabase.ts'
import { EmptyState } from './EmptyState.tsx'

interface SteamAccount {
  external_user_id: string
  display_name: string | null
  avatar_url: string | null
  profile_visibility: 'public' | 'private' | null
}

const STEAM_PRIVACY_URL = 'https://steamcommunity.com/my/edit/settings'

function SteamStatus({ account }: { account: SteamAccount }) {
  if (account.profile_visibility === 'public') {
    return <span className="pill" data-tone="positive">Perfil público</span>
  }
  if (account.profile_visibility === 'private') {
    return <span className="pill" data-tone="warning">Perfil privado</span>
  }
  return <span className="pill">Visibilidad sin comprobar</span>
}

export function Home() {
  const { state } = useAuth()
  const [account, setAccount] = useState<SteamAccount | null | undefined>(undefined)

  useEffect(() => {
    if (!supabase || state.status !== 'signed-in') return
    void supabase
      .from('linked_accounts')
      .select('external_user_id, display_name, avatar_url, profile_visibility')
      .eq('platform', 'steam')
      .maybeSingle()
      .then(({ data }) => setAccount((data as SteamAccount | null) ?? null))
  }, [state.status])

  const isPrivate = account?.profile_visibility === 'private'

  return (
    <div className="stack">
      <p className="finding">
        {isPrivate
          ? 'Tu perfil de Steam es privado: Pulso no podrá importar tus juegos ni tus logros hasta que lo hagas público.'
          : 'Tu cuenta de Steam está vinculada. La importación de juegos, horas y logros llega en la Fase 3.'}
      </p>

      <section className="panel steam-card" aria-label="Tu cuenta de Steam">
        <h2 className="panel-title">Tu cuenta de Steam</h2>
        {account === undefined ? (
          <p className="muted">Cargando…</p>
        ) : account === null ? (
          <p className="muted">No hay ninguna cuenta de Steam vinculada.</p>
        ) : (
          <div className="steam-row">
            <Avatar name={account.display_name ?? 'Steam'} src={account.avatar_url} size={56} />
            <div className="steam-meta">
              <p className="steam-name">{account.display_name ?? 'Sin nombre'}</p>
              <p className="muted num">SteamID {account.external_user_id}</p>
            </div>
            <SteamStatus account={account} />
            <a
              className="p-button"
              data-variant="ghost"
              href={`https://steamcommunity.com/profiles/${account.external_user_id}`}
              target="_blank"
              rel="noreferrer"
            >
              Ver en Steam <ExternalLink size={14} strokeWidth={1.5} aria-hidden="true" />
            </a>
          </div>
        )}
        {isPrivate && (
          <p className="steam-help">
            En Steam, abre{' '}
            <a href={STEAM_PRIVACY_URL} target="_blank" rel="noreferrer">
              Editar perfil → Privacidad
            </a>{' '}
            y pon <strong>Mi perfil</strong> y <strong>Detalles de juego</strong> en <strong>Público</strong>.
          </p>
        )}
      </section>

      <EmptyState title="Jugado recientemente">
        Aquí verás a qué has jugado esta semana y cuántas horas, en cuanto Pulso importe tu biblioteca de Steam.
      </EmptyState>
    </div>
  )
}
