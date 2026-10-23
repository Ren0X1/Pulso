import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { formatAgo } from '../lib/steam.ts'
import { loadNotifications, markAllRead, notificationText, type NotificationRow } from '../lib/social.ts'
import { EmptyState } from './EmptyState.tsx'

export function NotificationsPage() {
  const [items, setItems] = useState<NotificationRow[] | null>(null)

  useEffect(() => {
    // Se cargan con su estado de leídas y después se marcan, para que las nuevas se distingan esta vez.
    void loadNotifications().then((rows) => {
      setItems(rows)
      if (rows.some((r) => !r.read_at)) void markAllRead()
    })
  }, [])

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
            <li key={n.id} className="player-row notification" data-unread={n.read_at ? undefined : ''}>
              <Link to={href} className="player-link">
                {!n.read_at && <span className="now-dot" aria-label="Nueva" />}
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
