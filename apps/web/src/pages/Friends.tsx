import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Avatar, Button, Field } from '@pulso/ui'
import { useAuth } from '../lib/auth.tsx'
import {
  friendshipWith,
  loadMyFriendships,
  removeFriendship,
  respond,
  searchPlayers,
  sendRequest,
  type FriendshipWithPlayers,
  type PlayerSummary,
} from '../lib/friends.ts'

function PlayerRow({ player, children }: { player: PlayerSummary; children?: React.ReactNode }) {
  return (
    <li className="player-row">
      <Link to={`/u/${player.username}`} className="player-link">
        <Avatar name={player.username} src={player.avatar_url} size={36} />
        <span>{player.username}</span>
      </Link>
      <div className="row-actions">{children}</div>
    </li>
  )
}

export function FriendsPage() {
  const { state } = useAuth()
  const me = state.status === 'signed-in' ? state.session.user.id : ''
  const [rows, setRows] = useState<FriendshipWithPlayers[] | null>(null)
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<PlayerSummary[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setRows(await loadMyFriendships(me))
    } catch {
      setError('No se pudieron cargar tus amigos.')
    }
  }, [me])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    const handle = setTimeout(() => {
      void searchPlayers(term, me).then(setResults, () => setResults([]))
    }, 250)
    return () => clearTimeout(handle)
  }, [term, me])

  async function act(key: string, action: () => Promise<void>) {
    setBusy(key)
    setError(null)
    try {
      await action()
      await reload()
    } catch {
      setError('No se pudo completar la acción. Inténtalo de nuevo.')
    } finally {
      setBusy(null)
    }
  }

  if (!rows) return <p className="muted">Cargando…</p>

  const other = (r: FriendshipWithPlayers) => (r.requester_id === me ? r.addressee : r.requester)
  const incoming = rows.filter((r) => r.status === 'pending' && r.addressee_id === me)
  const outgoing = rows.filter((r) => r.status === 'pending' && r.requester_id === me)
  const friends = rows.filter((r) => r.status === 'accepted')

  return (
    <div className="friends-layout">
      <div className="stack">
        {incoming.length > 0 && (
          <section className="panel" aria-label="Solicitudes recibidas">
            <h2 className="panel-title">
              Solicitudes recibidas <span className="count num">{incoming.length}</span>
            </h2>
            <ul className="player-list">
              {incoming.map((r) => (
                <PlayerRow key={r.requester_id} player={r.requester}>
                  <Button busy={busy === `a${r.requester_id}`} onClick={() => void act(`a${r.requester_id}`, () => respond(r.requester_id, me, true))}>
                    Aceptar
                  </Button>
                  <Button variant="ghost" busy={busy === `d${r.requester_id}`} onClick={() => void act(`d${r.requester_id}`, () => respond(r.requester_id, me, false))}>
                    Rechazar
                  </Button>
                </PlayerRow>
              ))}
            </ul>
          </section>
        )}

        <section className="panel" aria-label="Tus amigos">
          <h2 className="panel-title">
            Amigos <span className="count num">{friends.length}</span>
          </h2>
          {friends.length === 0 ? (
            <p className="muted">Aún no tienes amigos en Pulso. Busca a alguien por su nombre de usuario.</p>
          ) : (
            <ul className="player-list">
              {friends.map((r) => {
                const p = other(r)
                return (
                  <PlayerRow key={p.id} player={p}>
                    <Button variant="ghost" busy={busy === `r${p.id}`} onClick={() => void act(`r${p.id}`, () => removeFriendship(me, p.id))}>
                      Eliminar
                    </Button>
                  </PlayerRow>
                )
              })}
            </ul>
          )}
        </section>

        {outgoing.length > 0 && (
          <section className="panel" aria-label="Solicitudes enviadas">
            <h2 className="panel-title">Solicitudes enviadas</h2>
            <ul className="player-list">
              {outgoing.map((r) => (
                <PlayerRow key={r.addressee_id} player={r.addressee}>
                  <span className="muted">Pendiente</span>
                  <Button variant="ghost" busy={busy === `c${r.addressee_id}`} onClick={() => void act(`c${r.addressee_id}`, () => removeFriendship(me, r.addressee_id))}>
                    Cancelar
                  </Button>
                </PlayerRow>
              ))}
            </ul>
          </section>
        )}
        {error && <p className="notice" role="alert">{error}</p>}
      </div>

      <section className="panel" aria-label="Buscar jugadores">
        <h2 className="panel-title">Buscar jugadores</h2>
        <Field label="Nombre de usuario" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Escribe al menos 2 letras" />
        {term.trim().length >= 2 && results.length === 0 && <p className="muted search-empty">Nadie con ese nombre.</p>}
        <ul className="player-list">
          {results.map((p) => {
            const relation = friendshipWith(me, p.id, rows)
            return (
              <PlayerRow key={p.id} player={p}>
                {relation === 'none' && (
                  <Button busy={busy === `s${p.id}`} onClick={() => void act(`s${p.id}`, () => sendRequest(me, p.id))}>
                    Añadir
                  </Button>
                )}
                {relation === 'outgoing' && <span className="muted">Solicitud enviada</span>}
                {relation === 'incoming' && <span className="muted">Te ha enviado una solicitud</span>}
                {relation === 'friends' && <span className="pill">Amigos</span>}
              </PlayerRow>
            )
          })}
        </ul>
      </section>
    </div>
  )
}

