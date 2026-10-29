import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../lib/auth.tsx'
import { useLive, userTopic } from '../lib/live.ts'
import type { CatalogGame } from '../lib/library.ts'
import { formatAgo } from '../lib/steam.ts'
import { supabase } from '../lib/supabase.ts'
import { Cover } from './Cover.tsx'
import { EmptyState } from './EmptyState.tsx'

interface PlayedEvent {
  id: number
  created_at: string
  payload: { name?: string; minutes?: number }
  game: Pick<CatalogGame, 'name' | 'cover_url'> | null
}

function duration(minutes = 0): string {
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}

export function ActivityPage() {
  const { state } = useAuth()
  const me = state.status === 'signed-in' ? state.session.user.id : ''
  const [events, setEvents] = useState<PlayedEvent[] | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase!
      .from('activity_events')
      .select('id, created_at, payload, game:games(name, cover_url)')
      .eq('user_id', me)
      .eq('kind', 'played')
      .order('created_at', { ascending: false })
      .limit(50)
    setEvents((data ?? []) as unknown as PlayedEvent[])
  }, [me])

  useEffect(() => {
    void load()
  }, [load])
  useLive([me && userTopic(me)], load)

  if (!events) return <p className="muted">Cargando…</p>
  if (events.length === 0) {
    return (
      <EmptyState title="Sin partidas todavía">
        Con el launcher de Pulso abierto (o en la bandeja), cada partida que juegues quedará aquí con su duración, la
        abras desde Pulso o desde Steam.
      </EmptyState>
    )
  }

  const total = events.reduce((sum, e) => sum + (e.payload.minutes ?? 0), 0)
  return (
    <section className="panel" aria-label="Partidas">
      <h2 className="panel-title">
        Partidas <span className="count num">{events.length} · {duration(total)}</span>
      </h2>
      <ul className="ach-list">
        {events.map((e) => {
          const name = e.game?.name ?? e.payload.name ?? 'Juego'
          return (
            <li key={e.id} className="ach-row">
              <Cover game={{ name, cover_url: e.game?.cover_url ?? null }} small />
              <div className="ach-meta">
                <span className="ach-name">{name}</span>
                <span className="muted">{formatAgo(e.created_at)}</span>
              </div>
              <span className="num ach-count">{duration(e.payload.minutes)}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
