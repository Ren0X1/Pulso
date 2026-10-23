import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { Avatar } from '@pulso/ui'
import type { Profile as ProfileRow } from '../lib/auth.tsx'
import { PROFILE_COLUMNS, useAuth } from '../lib/auth.tsx'
import { supabase } from '../lib/supabase.ts'
import { EmptyState } from './EmptyState.tsx'
import { FriendButton } from './FriendButton.tsx'
import { ProfileShowcase } from './ProfileShowcase.tsx'
import { PlatinumCount } from './Platinum.tsx'
import { ProfileLinks } from './ProfileLinks.tsx'
import { loadPlatinums } from '../lib/achievements.ts'

const joined = new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric' })

export function ProfilePage() {
  const { username = '' } = useParams()
  const { state } = useAuth()
  const [profile, setProfile] = useState<ProfileRow | null | undefined>(undefined)
  const [platinums, setPlatinums] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (!supabase) return
    setProfile(undefined)
    setPlatinums(new Set())
    void supabase
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('username', username.toLowerCase())
      .maybeSingle()
      .then(({ data }) => {
        const found = (data as ProfileRow | null) ?? null
        setProfile(found)
        if (found) void loadPlatinums(found.id).then(setPlatinums)
      })
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
      <section className="panel profile-card" aria-label={`Perfil de ${profile.username}`}>
        <div className="profile-banner" data-empty={profile.banner_url ? undefined : ''}>
          {profile.banner_url && <img src={profile.banner_url} alt="" />}
        </div>
        <div className="profile-head">
        <span className="profile-avatar">
          <Avatar name={profile.username} src={profile.avatar_url} size={96} />
        </span>
        <div className="profile-meta">
          <div className="name-row">
            <h2 className="profile-name">{profile.username}</h2>
            <PlatinumCount count={platinums.size} />
          </div>
          <p className="muted">En Pulso desde {joined.format(new Date(profile.created_at))}</p>
          {profile.bio ? <p className="profile-bio">{profile.bio}</p> : isMe && <p className="muted">Aún no has escrito tu bio.</p>}
          <ProfileLinks links={profile.links} />
        </div>
        {isMe ? (
          <Link className="p-button" data-variant="ghost" to="/ajustes">
            Editar perfil
          </Link>
        ) : (
          state.status === 'signed-in' && (
            <div className="row-actions">
              <FriendButton me={state.session.user.id} other={profile.id} />
              <Link className="p-button" data-variant="ghost" to={`/u/${profile.username}/comparar`}>
                Comparar
              </Link>
            </div>
          )
        )}
        </div>
      </section>

      <ProfileShowcase userId={profile.id} isMe={isMe} platinums={platinums} favorites={profile.favorite_game_ids ?? []} />
    </div>
  )
}
