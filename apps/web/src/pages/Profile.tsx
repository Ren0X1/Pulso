import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { Avatar } from '@pulso/ui'
import type { Profile as ProfileRow } from '../lib/auth.tsx'
import { useAuth } from '../lib/auth.tsx'
import { supabase } from '../lib/supabase.ts'
import { EmptyState } from './EmptyState.tsx'
import { FriendButton } from './FriendButton.tsx'
import { ProfileShowcase } from './ProfileShowcase.tsx'

const joined = new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric' })

export function ProfilePage() {
  const { username = '' } = useParams()
  const { state } = useAuth()
  const [profile, setProfile] = useState<ProfileRow | null | undefined>(undefined)

  useEffect(() => {
    if (!supabase) return
    setProfile(undefined)
    void supabase
      .from('profiles')
      .select('id, username, avatar_url, banner_url, bio, created_at')
      .eq('username', username.toLowerCase())
      .maybeSingle()
      .then(({ data }) => setProfile((data as ProfileRow | null) ?? null))
  }, [username])

  if (profile === undefined) return <p className="muted">Cargando perfil…</p>
  if (profile === null) {
    return (
      <EmptyState title="Este jugador no existe" action={<Link to="/">Volver al inicio</Link>}>
        No hay nadie en Pulso con el nombre <strong>{username}</strong>.
      </EmptyState>
    )
  }

  const isMe = state.status === 'signed-in' && state.session.user.id === profile.id

  return (
    <div className="stack">
      <section className="panel profile-head" aria-label={`Perfil de ${profile.username}`}>
        <Avatar name={profile.username} src={profile.avatar_url} size={88} />
        <div className="profile-meta">
          <h2 className="profile-name">{profile.username}</h2>
          <p className="muted">En Pulso desde {joined.format(new Date(profile.created_at))}</p>
          {profile.bio ? <p className="profile-bio">{profile.bio}</p> : isMe && <p className="muted">Aún no has escrito tu bio.</p>}
        </div>
        {isMe ? (
          <Link className="p-button" data-variant="ghost" to="/ajustes">
            Editar perfil
          </Link>
        ) : (
          state.status === 'signed-in' && <FriendButton me={state.session.user.id} other={profile.id} />
        )}
      </section>

      <ProfileShowcase userId={profile.id} isMe={isMe} />
    </div>
  )
}
