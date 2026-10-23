import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Avatar } from '@pulso/ui'
import { formatAgo } from '../lib/steam.ts'
import { feedText, loadFriendsFeed, type FeedEvent } from '../lib/social.ts'
import { Cover } from './Cover.tsx'

/** Lo último que han jugado o platinado tus amigos (según la privacidad de actividad de cada uno). */
export function FriendsFeed({ me, limit = 8 }: { me: string; limit?: number }) {
  const [events, setEvents] = useState<FeedEvent[] | null>(null)

  useEffect(() => {
    void loadFriendsFeed(me, limit).then(setEvents, () => setEvents([]))
  }, [me, limit])

  return (
    <section className="panel" aria-label="Actividad de amigos">
      <div className="panel-title-row">
        <h2 className="panel-title">Actividad de amigos</h2>
        <Link to="/amigos">Amigos</Link>
      </div>
      {events === null ? (
        <p className="muted">Cargando…</p>
      ) : events.length === 0 ? (
        <p className="muted">
          Nada todavía. Aquí verás a qué juegan tus amigos y sus platinos (si su privacidad lo permite).
        </p>
      ) : (
        <ul className="ach-list">
          {events.map((e) => {
            const name = e.game?.name ?? e.payload.name ?? 'un juego'
            return (
              <li key={e.id} className="ach-row">
                <Avatar name={e.player.username} src={e.player.avatar_url} size={32} />
                <div className="ach-meta">
                  <span>
                    <Link to={`/u/${e.player.username}`} className="feed-user">
                      {e.player.username}
                    </Link>{' '}
                    {feedText(e, name)}
                  </span>
                  <span className="muted">{formatAgo(e.created_at)}</span>
                </div>
                <Cover game={{ name, cover_url: e.game?.cover_url ?? null }} small platinum={e.kind === 'platinum'} />
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
