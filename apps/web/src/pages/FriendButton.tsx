import { useCallback, useEffect, useState } from 'react'
import { Button } from '@pulso/ui'
import { friendshipWith, loadRelation, removeFriendship, respond, sendRequest, type Relation } from '../lib/friends.ts'

/** La acción de amistad que toca con otro jugador, según en qué punto estéis. */
export function FriendButton({ me, other }: { me: string; other: string }) {
  const [relation, setRelation] = useState<Relation | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const reload = useCallback(async () => {
    setRelation(friendshipWith(me, other, await loadRelation(me, other)))
  }, [me, other])

  useEffect(() => {
    void reload()
  }, [reload])

  async function act(action: () => Promise<void>) {
    setBusy(true)
    setFailed(false)
    try {
      await action()
      await reload()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  if (!relation || relation === 'self') return null
  return (
    <div className="row-actions">
      {relation === 'none' && (
        <Button busy={busy} onClick={() => void act(() => sendRequest(me, other))}>
          Añadir amigo
        </Button>
      )}
      {relation === 'outgoing' && (
        <Button variant="ghost" busy={busy} onClick={() => void act(() => removeFriendship(me, other))}>
          Cancelar solicitud
        </Button>
      )}
      {relation === 'incoming' && (
        <>
          <Button busy={busy} onClick={() => void act(() => respond(other, me, true))}>
            Aceptar solicitud
          </Button>
          <Button variant="ghost" busy={busy} onClick={() => void act(() => respond(other, me, false))}>
            Rechazar
          </Button>
        </>
      )}
      {relation === 'friends' && <span className="pill">Amigos</span>}
      {failed && <span className="muted" role="alert">No se pudo. Inténtalo de nuevo.</span>}
    </div>
  )
}
