import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { PRIVACY_LABELS, type PrivacyLevel } from '@pulso/core'
import { Button } from '@pulso/ui'
import { useAuth } from '../lib/auth.tsx'
import { searchCatalog, searchMyLibrary, type CatalogGame } from '../lib/library.ts'
import {
  addToList,
  createShareCode,
  deleteList,
  formatCode,
  loadCodes,
  loadList,
  loadListItems,
  myRole,
  removeFromList,
  removeMember,
  revokeCode,
  ROLE_LABELS,
  updateList,
  type GameList,
  type ListItem,
  type ListRole,
  type ShareCode,
} from '../lib/lists.ts'
import { supabase } from '../lib/supabase.ts'
import { ListMembers } from './ListMembers.tsx'
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
  userId,
  listId,
  have,
  onClose,
  onAdded,
}: {
  open: boolean
  userId: string
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

  // Primero tu biblioteca (no depende de IGDB), después el catálogo mundial.
  useEffect(() => {
    if (term.trim().length < 2) return setResults(null)
    const handle = setTimeout(async () => {
      const [mine, catalog] = await Promise.all([searchMyLibrary(userId, term), searchCatalog(term)])
      const seen = new Set(mine.map((g) => g.id))
      const extra = 'error' in catalog ? [] : catalog.games.filter((g) => !seen.has(g.id))
      setError(
        'error' in catalog
          ? mine.length
            ? 'Solo se muestran juegos de tu biblioteca: el catálogo mundial no está disponible ahora.'
            : catalog.error === 'catalog_not_configured'
              ? 'No está en tu biblioteca, y el catálogo mundial aún no está configurado.'
              : 'No está en tu biblioteca, y el catálogo mundial no responde ahora mismo.'
          : null,
      )
      setResults([...mine, ...extra])
    }, 400)
    return () => clearTimeout(handle)
  }, [term, userId])

  return (
    <Dialog open={open} title="Añadir a la lista" onClose={onClose} wide>
      <input
        className="search search-large"
        type="search"
        autoFocus
        placeholder="Busca en tu biblioteca o en el catálogo"
        aria-label="Buscar juegos"
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
  const [role, setRole] = useState<ListRole | null>(null)
  const [owner, setOwner] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const found = await loadList(id)
    setList(found)
    if (found) {
      setName(found.name)
      setItems(await loadListItems(id))
      if (found.owner_id !== me) {
        setRole(await myRole(id, me))
        const { data } = await supabase!.from('profiles').select('username').eq('id', found.owner_id).maybeSingle()
        setOwner((data as { username: string } | null)?.username ?? null)
      }
    }
  }, [id, me])

  useEffect(() => {
    void reload()
  }, [reload])

  if (list === undefined) return <p className="muted">Cargando…</p>
  if (list === null) return <EmptyState title="Lista no encontrada">No existe o no tienes permiso para verla.</EmptyState>

  const mine = list.owner_id === me
  const canEdit = mine || role === 'editor'

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
            {!mine && owner && (
              <>
                {' · de '}
                <Link to={`/u/${owner}`}>{owner}</Link>
                {role && ` · ${ROLE_LABELS[role].toLowerCase()}`}
              </>
            )}
          </p>
          {!mine && canEdit && (
            <div className="row-actions">
              <Button onClick={() => setAdding(true)}>Añadir juego</Button>
            </div>
          )}
          {!mine && role && (
            <div className="row-actions">
              <Button variant="ghost" onClick={() => void removeMember(id, me).then(() => navigate('/listas'))}>
                Salir de la lista
              </Button>
            </div>
          )}
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
            <p>{canEdit ? 'Añade juegos de tu biblioteca o del catálogo mundial.' : 'Aún no tiene juegos.'}</p>
          </section>
        ) : (
          <ul className="cover-grid">
            {items.map((item) => (
              <li key={item.game_id} className="cover-card">
                <Cover game={item.game} />
                <span className="cover-name">{item.game.name}</span>
                {canEdit && (
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
          <ListMembers listId={id} me={me} />
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

      {canEdit && (
        <AddToListDialog
          open={adding}
          userId={me}
          listId={id}
          have={new Set(items.map((i) => i.game_id))}
          onClose={() => setAdding(false)}
          onAdded={() => void reload()}
        />
      )}
    </div>
  )
}
