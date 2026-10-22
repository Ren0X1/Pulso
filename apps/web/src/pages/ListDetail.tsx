import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { PRIVACY_LABELS, type PrivacyLevel } from '@pulso/core'
import { Button } from '@pulso/ui'
import { useAuth } from '../lib/auth.tsx'
import { searchCatalog, type CatalogGame } from '../lib/library.ts'
import {
  addToList,
  createShareCode,
  deleteList,
  formatCode,
  loadCodes,
  loadList,
  loadListItems,
  removeFromList,
  revokeCode,
  updateList,
  type GameList,
  type ListItem,
  type ShareCode,
} from '../lib/lists.ts'
import { Cover } from './Cover.tsx'
import { Dialog } from './Dialog.tsx'
import { EmptyState } from './EmptyState.tsx'

function SharePanel({ listId }: { listId: string }) {
  const [codes, setCodes] = useState<ShareCode[]>([])
  const [copied, setCopied] = useState<string | null>(null)
  const [error, setError] = useState(false)

  const reload = useCallback(async () => setCodes(await loadCodes(listId)), [listId])
  useEffect(() => {
    void reload()
  }, [reload])

  async function act(action: () => Promise<unknown>) {
    try {
      await action()
      setError(false)
      await reload()
    } catch {
      setError(true)
    }
  }

  return (
    <section className="panel" aria-label="Compartir">
      <h2 className="panel-title">Compartir</h2>
      <p className="muted share-help">
        Quien cargue el código recibe una copia privada de la lista. Revócalo cuando quieras y dejará de funcionar.
      </p>
      {codes.length > 0 && (
        <ul className="code-list">
          {codes.map((c) => (
            <li key={c.code}>
              <code className="share-code">{formatCode(c.code)}</code>
              <Button
                variant="ghost"
                onClick={() =>
                  void navigator.clipboard.writeText(formatCode(c.code)).then(() => {
                    setCopied(c.code)
                    setTimeout(() => setCopied(null), 1500)
                  })
                }
              >
                {copied === c.code ? 'Copiado' : 'Copiar'}
              </Button>
              <Button variant="danger" onClick={() => void act(() => revokeCode(c.code))}>
                Revocar
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Button variant={codes.length ? 'ghost' : 'primary'} onClick={() => void act(() => createShareCode(listId))}>
        {codes.length ? 'Generar otro código' : 'Generar código'}
      </Button>
      {error && <p className="notice" role="alert">No se pudo completar la acción.</p>}
    </section>
  )
}

function AddToListDialog({
  open,
  listId,
  have,
  onClose,
  onAdded,
}: {
  open: boolean
  listId: string
  have: Set<number>
  onClose: () => void
  onAdded: () => void
}) {
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<CatalogGame[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setTerm('')
      setResults(null)
      setError(null)
    }
  }, [open])

  useEffect(() => {
    if (term.trim().length < 2) return setResults(null)
    const handle = setTimeout(async () => {
      const res = await searchCatalog(term)
      if ('error' in res) {
        setError(res.error === 'catalog_not_configured' ? 'El catálogo aún no está configurado.' : 'El catálogo no responde ahora mismo.')
        return setResults(null)
      }
      setError(null)
      setResults(res.games)
    }, 400)
    return () => clearTimeout(handle)
  }, [term])

  return (
    <Dialog open={open} title="Añadir a la lista" onClose={onClose} wide>
      <input
        className="search search-large"
        type="search"
        autoFocus
        placeholder="Busca cualquier juego"
        aria-label="Buscar en el catálogo"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
      />
      {error && <p className="notice" role="alert">{error}</p>}
      {results?.length === 0 && <p className="muted">Ningún juego con ese nombre.</p>}
      {results && results.length > 0 && (
        <ul className="catalog-results">
          {results.map((game) => (
            <li key={game.id} className="catalog-row">
              <Cover game={game} small />
              <div className="catalog-meta">
                <span className="catalog-name">{game.name}</span>
                <span className="muted">{game.release_date?.slice(0, 4) ?? ''}</span>
              </div>
              {have.has(game.id) ? (
                <span className="pill">En la lista</span>
              ) : (
                <Button
                  variant="ghost"
                  onClick={() => void addToList(listId, game.id, have.size).then(onAdded, () => setError('No se pudo añadir.'))}
                >
                  Añadir
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  )
}

export function ListDetailPage() {
  const { id = '' } = useParams()
  const { state } = useAuth()
  const me = state.status === 'signed-in' ? state.session.user.id : ''
  const navigate = useNavigate()
  const [list, setList] = useState<GameList | null | undefined>(undefined)
  const [items, setItems] = useState<ListItem[]>([])
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const reload = useCallback(async () => {
    const found = await loadList(id)
    setList(found)
    if (found) {
      setName(found.name)
      setItems(await loadListItems(id))
    }
  }, [id])

  useEffect(() => {
    void reload()
  }, [reload])

  if (list === undefined) return <p className="muted">Cargando…</p>
  if (list === null) return <EmptyState title="Lista no encontrada">No existe o no tienes permiso para verla.</EmptyState>

  const mine = list.owner_id === me

  async function save(patch: Parameters<typeof updateList>[1]) {
    try {
      await updateList(id, patch)
      setError(null)
      await reload()
    } catch {
      setError('No se pudo guardar.')
    }
  }

  return (
    <div className="list-layout">
      <div className="stack">
        <section className="panel list-head">
          {mine ? (
            <input
              className="list-title-input"
              aria-label="Nombre de la lista"
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name.trim() && name !== list.name && void save({ name: name.trim() })}
            />
          ) : (
            <h2 className="list-title">{list.name}</h2>
          )}
          <p className="muted num">
            {items.length} {items.length === 1 ? 'juego' : 'juegos'}
          </p>
          {mine && (
            <div className="row-actions">
              <select
                aria-label="Quién puede ver la lista"
                value={list.visibility}
                onChange={(e) => void save({ visibility: e.target.value as PrivacyLevel })}
              >
                {(Object.keys(PRIVACY_LABELS) as PrivacyLevel[]).map((level) => (
                  <option key={level} value={level}>
                    {PRIVACY_LABELS[level]}
                  </option>
                ))}
              </select>
              <Button onClick={() => setAdding(true)}>Añadir juego</Button>
            </div>
          )}
          {error && <p className="notice" role="alert">{error}</p>}
        </section>

        {items.length === 0 ? (
          <section className="empty">
            <h2>La lista está vacía</h2>
            <p>{mine ? 'Añade juegos del catálogo.' : 'Su dueño aún no ha añadido juegos.'}</p>
          </section>
        ) : (
          <ul className="cover-grid">
            {items.map((item) => (
              <li key={item.game_id} className="cover-card">
                <Cover game={item.game} />
                <span className="cover-name">{item.game.name}</span>
                {mine && (
                  <button type="button" className="link-button cover-meta" onClick={() => void removeFromList(id, item.game_id).then(reload)}>
                    Quitar
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {mine && (
        <div className="stack">
          <SharePanel listId={id} />
          <section className="panel">
            {confirmDelete ? (
              <div className="row-actions">
                <Button variant="danger" onClick={() => void deleteList(id).then(() => navigate('/listas'))}>
                  Sí, borrar para siempre
                </Button>
                <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                  Cancelar
                </Button>
              </div>
            ) : (
              <Button variant="danger" onClick={() => setConfirmDelete(true)}>
                Borrar lista
              </Button>
            )}
          </section>
        </div>
      )}

      {mine && (
        <AddToListDialog
          open={adding}
          listId={id}
          have={new Set(items.map((i) => i.game_id))}
          onClose={() => setAdding(false)}
          onAdded={() => void reload()}
        />
      )}
    </div>
  )
}
