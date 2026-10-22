import { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { Avatar } from '@pulso/ui'
import { useAuth } from '../lib/auth.tsx'
import { supabase } from '../lib/supabase.ts'
import { Link } from 'react-router'
import { countIncoming } from '../lib/friends.ts'
import { Cover } from './Cover.tsx'
import type { CatalogGame } from '../lib/library.ts'

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
  const [recent, setRecent] = useState<{ game_id: number; game: CatalogGame }[] | null>(null)
  const [incoming, setIncoming] = useState(0)

  useEffect(() => {
    if (!supabase || state.status !== 'signed-in') return
    void supabase
      .from('linked_accounts')
      .select('external_user_id, display_name, avatar_url, profile_visibility')
      .eq('platform', 'steam')
      .maybeSingle()
      .then(({ data }) => setAccount((data as SteamAccount | null) ?? null))
    const me = state.session.user.id
    void supabase
      .from('user_games')
      .select('game_id, game:games!inner(id, name, slug, summary, release_date, cover_url, genres, platforms)')
      .eq('user_id', me)
      .order('added_at', { ascending: false })
      .limit(6)
      .then(({ data }) => setRecent((data ?? []) as unknown as { game_id: number; game: CatalogGame }[]))
    void countIncoming(me).then(setIncoming)
  }, [state])

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

      {incoming > 0 && (
        <p className="notice notice-neutral">
          Tienes {incoming} {incoming === 1 ? 'solicitud' : 'solicitudes'} de amistad. <Link to="/amigos">Responder</Link>
        </p>
      )}

      <section className="panel" aria-label="Añadidos recientemente">
        <div className="panel-title-row">
          <h2 className="panel-title">Añadidos recientemente</h2>
          <Link to="/biblioteca">Biblioteca</Link>
        </div>
        {recent === null ? (
          <p className="muted">Cargando…</p>
        ) : recent.length === 0 ? (
          <p className="muted">
            Aún no hay juegos en tu biblioteca. <Link to="/biblioteca">Añade el primero</Link>. Las horas y lo jugado esta semana
            llegarán al importar Steam (Fase 3).
          </p>
        ) : (
          <ul className="cover-grid cover-grid-row">
            {recent.map((r) => (
              <li key={r.game_id} className="cover-card">
                <Cover game={r.game} />
                <span className="cover-name">{r.game.name}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
