import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { PRIVACY_LABELS } from '@pulso/core'
import { Button, Field } from '@pulso/ui'
import { useAuth } from '../lib/auth.tsx'
import { createList, loadLists, redeemCode, REDEEM_ERRORS, type GameList } from '../lib/lists.ts'
import { Dialog } from './Dialog.tsx'

export function ListsPage() {
  const { state } = useAuth()
  const me = state.status === 'signed-in' ? state.session.user.id : ''
  const navigate = useNavigate()
  const [lists, setLists] = useState<GameList[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [creating, setCreating] = useState(false)
  const [redeeming, setRedeeming] = useState(false)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    try {
      setLists(await loadLists(me))
    } catch {
      setFailed(true)
    }
  }, [me])

  useEffect(() => {
    void reload()
  }, [reload])

  async function submitNew(event: FormEvent) {
    event.preventDefault()
    const clean = name.trim()
    if (!clean) return setError('Ponle un nombre a la lista.')
    setBusy(true)
    try {
      navigate(`/listas/${await createList(me, clean.slice(0, 80))}`)
    } catch {
      setError('No se pudo crear la lista.')
    } finally {
      setBusy(false)
    }
  }

  async function submitCode(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    const result = await redeemCode(code)
    setBusy(false)
    if ('error' in result) return setError(REDEEM_ERRORS[result.error])
    navigate(`/listas/${result.id}`)
  }

  const open = (which: 'new' | 'code') => {
    setError(null)
    setName('')
    setCode('')
    if (which === 'new') setCreating(true)
    else setRedeeming(true)
  }

  return (
    <div className="stack">
      <div className="title-row">
        <p className="finding">Listas de pendientes, recomendaciones o lo que quieras. Compártelas con un código.</p>
        <div className="row-actions">
          <Button variant="ghost" onClick={() => open('code')}>
            Cargar código
          </Button>
          <Button onClick={() => open('new')}>Nueva lista</Button>
        </div>
      </div>

      {failed && <p className="notice" role="alert">No se pudieron cargar tus listas.</p>}
      {!lists && !failed && <p className="muted">Cargando…</p>}
      {lists?.length === 0 && (
        <section className="empty">
          <h2>Aún no tienes listas</h2>
          <p>Crea una, o carga el código que te haya pasado un amigo para quedarte con una copia de la suya.</p>
        </section>
      )}
      {lists && lists.length > 0 && (
        <ul className="list-index">
          {lists.map((list) => (
            <li key={list.id}>
              <Link to={`/listas/${list.id}`} className="list-card">
                <span className="list-name">{list.name}</span>
                <span className="muted num">
                  {list.items[0]?.count ?? 0} {list.items[0]?.count === 1 ? 'juego' : 'juegos'} · {PRIVACY_LABELS[list.visibility]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={creating} title="Nueva lista" onClose={() => setCreating(false)}>
        <form className="stack" onSubmit={(e) => void submitNew(e)}>
          <Field label="Nombre" value={name} maxLength={80} autoFocus onChange={(e) => setName(e.target.value)} error={error} />
          <Button type="submit" busy={busy}>
            Crear lista
          </Button>
        </form>
      </Dialog>

      <Dialog open={redeeming} title="Cargar código" onClose={() => setRedeeming(false)}>
        <form className="stack" onSubmit={(e) => void submitCode(e)}>
          <Field
            label="Código de la lista"
            value={code}
            autoFocus
            placeholder="ABCD-EFGH-23"
            hint="Se creará una copia privada en tu cuenta; los cambios no afectan a la original."
            error={error}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <Button type="submit" busy={busy} disabled={code.replace(/[^A-Z2-7]/g, '').length !== 10}>
            Cargar lista
          </Button>
        </form>
      </Dialog>
    </div>
  )
}
