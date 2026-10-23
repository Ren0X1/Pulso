import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Avatar, Button } from '@pulso/ui'
import { loadMyFriendships, type PlayerSummary } from '../lib/friends.ts'
import { addMember, loadMembers, removeMember, ROLE_LABELS, setMemberRole, type ListMember, type ListRole } from '../lib/lists.ts'

/** Panel del dueño: a qué amigos invitar a la lista y qué puede hacer cada uno. */
export function ListMembers({ listId, me }: { listId: string; me: string }) {
  const [members, setMembers] = useState<ListMember[]>([])
  const [friends, setFriends] = useState<PlayerSummary[]>([])
  const [pick, setPick] = useState('')
  const [role, setRole] = useState<ListRole>('editor')
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const [m, f] = await Promise.all([loadMembers(listId), loadMyFriendships(me)])
    setMembers(m)
    setFriends(f.filter((r) => r.status === 'accepted').map((r) => (r.requester_id === me ? r.addressee : r.requester)))
  }, [listId, me])

  useEffect(() => {
    void reload()
  }, [reload])

  async function act(action: () => Promise<void>) {
    try {
      await action()
      setError(null)
      await reload()
    } catch {
      setError('No se pudo completar la acción.')
    }
  }

  const memberIds = new Set(members.map((m) => m.user_id))
  const invitable = friends.filter((f) => !memberIds.has(f.id))

  return (
    <section className="panel" aria-label="Personas con acceso">
      <h2 className="panel-title">Personas con acceso</h2>
      <p className="muted share-help">Invita a tus amigos: la verán aunque sea privada, y si pueden editar, añadirán y quitarán juegos.</p>

      {members.length > 0 && (
        <ul className="player-list members">
          {members.map((m) => (
            <li key={m.user_id} className="player-row">
              <Link to={`/u/${m.player.username}`} className="player-link">
                <Avatar name={m.player.username} src={m.player.avatar_url} size={28} />
                <span>{m.player.username}</span>
              </Link>
              <div className="row-actions">
                <select
                  aria-label={`Permiso de ${m.player.username}`}
                  value={m.role}
                  onChange={(e) => void act(() => setMemberRole(listId, m.user_id, e.target.value as ListRole))}
                >
                  {(Object.keys(ROLE_LABELS) as ListRole[]).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
                <Button variant="ghost" onClick={() => void act(() => removeMember(listId, m.user_id))}>
                  Quitar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {friends.length === 0 ? (
        <p className="muted">
          Solo puedes invitar a amigos. <Link to="/amigos">Añade amigos</Link> primero.
        </p>
      ) : invitable.length === 0 ? (
        <p className="muted">Todos tus amigos tienen ya acceso.</p>
      ) : (
        <div className="invite-row">
          <select aria-label="Amigo a invitar" value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Elige un amigo</option>
            {invitable.map((f) => (
              <option key={f.id} value={f.id}>
                {f.username}
              </option>
            ))}
          </select>
          <select aria-label="Permiso" value={role} onChange={(e) => setRole(e.target.value as ListRole)}>
            {(Object.keys(ROLE_LABELS) as ListRole[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          <Button
            disabled={!pick}
            onClick={() =>
              void act(async () => {
                await addMember(listId, pick, role)
                setPick('')
              })
            }
          >
            Invitar
          </Button>
        </div>
      )}
      {error && <p className="notice" role="alert">{error}</p>}
    </section>
  )
}
