import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../lib/auth.tsx'
import { useLive, userTopic } from '../lib/live.ts'
import { formatAgo } from '../lib/steam.ts'
import { loadNotifications, markAllRead, notificationText, type NotificationRow } from '../lib/social.ts'
import { EmptyState } from './EmptyState.tsx'

export function NotificationsPage() {
  const { state } = useAuth()
  const me = state.status === 'signed-in' ? state.session.user.id : ''
  const [items, setItems] = useState<NotificationRow[] | null>(null)
  // Las que llegaron sin leer durante esta visita siguen marcadas como nuevas aunque ya se hayan leído.
  const fresh = useRef(new Set<NotificationRow['id']>())

  const load = useCallback(async () => {
    // Se cargan con su estado de leídas y después se marcan, para que las nuevas se distingan esta vez.
    const rows = await loadNotifications()
    for (const r of rows) if (!r.read_at) fresh.current.add(r.id)
    setItems(rows)
    if (rows.some((r) => !r.read_at)) void markAllRead()
  }, [])

  useEffect(() => {
    void load()
  }, [load])
  useLive([me && userTopic(me)], load)

  if (!items) return <p className="muted">Cargando…</p>
  if (items.length === 0) {
    return (
      <EmptyState title="No tienes notificaciones">
        Aquí verás las solicitudes de amistad, quién las acepta y las invitaciones a listas.
      </EmptyState>
    )
  }

  return (
    <section className="panel" aria-label="Notificaciones">
      <ul className="player-list">
        {items.map((n) => {
          const { text, href } = notificationText(n)
          return (
            <li key={n.id} className="player-row notification" data-unread={fresh.current.has(n.id) ? '' : undefined}>
              <Link to={href} className="player-link">
                {fresh.current.has(n.id) && <span className="now-dot" aria-label="Nueva" />}
                <span>{text}</span>
              </Link>
              <span className="muted">{formatAgo(n.created_at)}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
