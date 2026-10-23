import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Grid2x2, List, Star } from 'lucide-react'
import { Button, Field } from '@pulso/ui'
import { useAuth } from '../lib/auth.tsx'
import {
  formatPlaytime,
  loadLibrary,
  loadMyTags,
  parseLibraryParams,
  PAGE_SIZE,
  SORT_LABELS,
  STATUS_LABELS,
  STATUSES,
  toSearchParams,
  type LibraryEntry,
  type LibraryParams,
  type LibrarySort,
} from '../lib/library.ts'
import { AddGameDialog } from './AddGameDialog.tsx'
import { EntryDialog } from './EntryDialog.tsx'
import { Cover } from './Cover.tsx'
import { SyncSteam } from './SyncSteam.tsx'

const dateFormat = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric' })

export function LibraryPage() {
  const { state } = useAuth()
  const me = state.status === 'signed-in' ? state.session.user.id : ''
  const [search, setSearch] = useSearchParams()
  const params = useMemo(() => parseLibraryParams(search), [search])
  const [data, setData] = useState<{ rows: LibraryEntry[]; total: number } | null>(null)
  const [tags, setTags] = useState<string[]>([])
  const [error, setError] = useState(false)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<LibraryEntry | null>(null)
  const [q, setQ] = useState(params.q)

  const reload = useCallback(async () => {
    try {
      setData(await loadLibrary(me, params))
      setTags(await loadMyTags(me))
      setError(false)
    } catch {
      setError(true)
    }
  }, [me, params])

  useEffect(() => {
    void reload()
  }, [reload])

  const update = (patch: Partial<LibraryParams>) =>
    setSearch(toSearchParams({ ...params, page: 1, ...patch }), { replace: true })

  // La búsqueda escribe en la URL con un pequeño retardo.
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) return void (firstRender.current = false)
    const handle = setTimeout(() => update({ q }), 300)
    return () => clearTimeout(handle)
  }, [q])

  const filtered = params.status || params.favorite || params.tag || params.q

  return (
    <div className="stack">
      <div className="title-row">
        <p className="finding num">
          {data ? `${data.total} ${data.total === 1 ? 'juego' : 'juegos'}${filtered ? ' con estos filtros' : ' en tu biblioteca'}` : ' '}
        </p>
        <Button onClick={() => setAdding(true)}>Añadir juego</Button>
      </div>

      <SyncSteam onSynced={() => void reload()} />

      <nav className="tabs" aria-label="Estado">
        <button type="button" aria-pressed={!params.status} onClick={() => update({ status: null })}>
          Todos
        </button>
        {STATUSES.map((s) => (
          <button key={s} type="button" aria-pressed={params.status === s} onClick={() => update({ status: s })}>
            {STATUS_LABELS[s]}
          </button>
        ))}
      </nav>

      <div className="toolbar">
        <input
          className="search"
          type="search"
          placeholder="Buscar en tu biblioteca"
          aria-label="Buscar en tu biblioteca"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button type="button" className="toggle" aria-pressed={params.favorite} onClick={() => update({ favorite: !params.favorite })}>
          <Star size={14} strokeWidth={1.5} aria-hidden="true" /> Favoritos
        </button>
        {tags.length > 0 && (
          <select aria-label="Etiqueta" value={params.tag ?? ''} onChange={(e) => update({ tag: e.target.value || null })}>
            <option value="">Todas las etiquetas</option>
            {tags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}
        <select aria-label="Orden" value={params.sort} onChange={(e) => update({ sort: e.target.value as LibrarySort })}>
          {Object.entries(SORT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <div className="view-switch" role="group" aria-label="Vista">
          <button type="button" aria-pressed={params.view === 'grid'} aria-label="Cuadrícula" onClick={() => update({ view: 'grid' })}>
            <Grid2x2 size={16} strokeWidth={1.5} aria-hidden="true" />
          </button>
          <button type="button" aria-pressed={params.view === 'list'} aria-label="Lista" onClick={() => update({ view: 'list' })}>
            <List size={16} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>
      </div>

      {error && (
        <p className="notice" role="alert">
          No se pudo cargar tu biblioteca. <button type="button" className="link-button" onClick={() => void reload()}>Reintentar</button>
        </p>
      )}
      {!data && !error && <p className="muted">Cargando…</p>}

      {data && data.rows.length === 0 && (
        <section className="empty">
          <h2>{filtered ? 'Nada con estos filtros' : 'Tu biblioteca está vacía'}</h2>
          <p>
            {filtered
              ? 'Prueba con otro estado, etiqueta o búsqueda.'
              : 'Sincroniza con Steam para importar tus juegos, o añade cualquiera del catálogo mundial.'}
          </p>
          {!filtered && <Button onClick={() => setAdding(true)}>Añadir juego</Button>}
        </section>
      )}

      {data && data.rows.length > 0 && params.view === 'grid' && (
        <ul className="cover-grid">
          {data.rows.map((entry) => (
            <li key={entry.game_id}>
              <button type="button" className="cover-card" onClick={() => setEditing(entry)}>
                <Cover game={entry.game} />
                <span className="cover-name">{entry.game.name}</span>
                <span className="cover-meta">
                  {STATUS_LABELS[entry.status]}
                  {entry.favorite && <Star className="fav" size={12} strokeWidth={1.5} aria-label="Favorito" />}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {data && data.rows.length > 0 && params.view === 'list' && (
        <table className="library-table">
          <thead>
            <tr>
              <th>Juego</th>
              <th>Estado</th>
              <th>Etiquetas</th>
              <th className="num">Horas</th>
              <th className="num">Añadido</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((entry) => (
              <tr key={entry.game_id}>
                <td>
                  <button type="button" className="row-game" onClick={() => setEditing(entry)}>
                    <Cover game={entry.game} small />
                    <span>{entry.game.name}</span>
                    {entry.favorite && <Star className="fav" size={12} strokeWidth={1.5} aria-label="Favorito" />}
                  </button>
                </td>
                <td>{STATUS_LABELS[entry.status]}</td>
                <td className="muted">{entry.tags.join(', ') || '—'}</td>
                <td className="num">{formatPlaytime(entry.playtime_minutes)}</td>
                <td className="num muted">{dateFormat.format(new Date(entry.added_at))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {data && data.rows.length < data.total && (
        <div className="load-more">
          <Button variant="ghost" onClick={() => update({ page: params.page + 1 })}>
            Cargar {Math.min(PAGE_SIZE, data.total - data.rows.length)} más
          </Button>
        </div>
      )}

      <AddGameDialog
        open={adding}
        userId={me}
        onClose={() => setAdding(false)}
        onAdded={() => void reload()}
      />
      <EntryDialog
        entry={editing}
        userId={me}
        knownTags={tags}
        onClose={() => setEditing(null)}
        onChanged={() => void reload()}
      />
    </div>
  )
}
