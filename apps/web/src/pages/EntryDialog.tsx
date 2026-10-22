import { useEffect, useState, type FormEvent } from 'react'
import { Star, X } from 'lucide-react'
import { Button } from '@pulso/ui'
import {
  formatPlaytime,
  removeFromLibrary,
  STATUS_LABELS,
  STATUSES,
  updateEntry,
  type LibraryEntry,
} from '../lib/library.ts'
import { Cover } from './Cover.tsx'
import { Dialog } from './Dialog.tsx'

const MAX_TAGS = 10

export function EntryDialog({
  entry,
  userId,
  knownTags,
  onClose,
  onChanged,
}: {
  entry: LibraryEntry | null
  userId: string
  knownTags: string[]
  onClose: () => void
  onChanged: () => void
}) {
  const [current, setCurrent] = useState(entry)
  const [tag, setTag] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setCurrent(entry)
    setTag('')
    setError(null)
  }, [entry])

  if (!current) return <Dialog open={false} title="" onClose={onClose}>{null}</Dialog>

  async function save(patch: Partial<Pick<LibraryEntry, 'status' | 'favorite' | 'tags'>>) {
    const previous = current!
    setCurrent({ ...previous, ...patch })
    try {
      await updateEntry(userId, previous.game_id, patch)
      onChanged()
    } catch {
      setCurrent(previous)
      setError('No se pudo guardar el cambio.')
    }
  }

  function addTag(event: FormEvent) {
    event.preventDefault()
    const clean = tag.trim().toLowerCase().slice(0, 40)
    if (!clean || current!.tags.includes(clean) || current!.tags.length >= MAX_TAGS) return
    setTag('')
    void save({ tags: [...current!.tags, clean] })
  }

  async function remove() {
    try {
      await removeFromLibrary(userId, current!.game_id)
      onChanged()
      onClose()
    } catch {
      setError('No se pudo quitar el juego.')
    }
  }

  const { game } = current
  return (
    <Dialog open={!!entry} title={game.name} onClose={onClose}>
      <div className="entry-head">
        <Cover game={game} />
        <div className="entry-facts">
          <p className="muted">
            {[game.release_date?.slice(0, 4), game.genres.slice(0, 3).join(', ')].filter(Boolean).join(' · ')}
          </p>
          <p>
            <span className="muted">Horas jugadas: </span>
            <span className="num">{formatPlaytime(current.playtime_minutes)}</span>
            {current.source === 'manual' && <span className="muted"> (llegarán al importar Steam)</span>}
          </p>
          {game.summary && <p className="entry-summary">{game.summary}</p>}
        </div>
      </div>

      <fieldset className="segmented">
        <legend>Estado</legend>
        {STATUSES.map((s) => (
          <button key={s} type="button" aria-pressed={current.status === s} onClick={() => void save({ status: s })}>
            {STATUS_LABELS[s]}
          </button>
        ))}
      </fieldset>

      <button type="button" className="toggle" aria-pressed={current.favorite} onClick={() => void save({ favorite: !current.favorite })}>
        <Star size={14} strokeWidth={1.5} aria-hidden="true" /> {current.favorite ? 'En favoritos' : 'Añadir a favoritos'}
      </button>

      <div className="tags-block">
        <p className="field-label">Etiquetas</p>
        <ul className="tag-list">
          {current.tags.map((t) => (
            <li key={t} className="pill">
              {t}
              <button
                type="button"
                className="tag-remove"
                aria-label={`Quitar etiqueta ${t}`}
                onClick={() => void save({ tags: current.tags.filter((x) => x !== t) })}
              >
                <X size={12} strokeWidth={1.5} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        {current.tags.length < MAX_TAGS && (
          <form className="tag-form" onSubmit={addTag}>
            <input
              list="known-tags"
              value={tag}
              maxLength={40}
              placeholder="coop, rpg, con amigos…"
              aria-label="Nueva etiqueta"
              onChange={(e) => setTag(e.target.value)}
            />
            <datalist id="known-tags">
              {knownTags.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            <Button type="submit" variant="ghost">
              Añadir
            </Button>
          </form>
        )}
      </div>

      {error && <p className="notice" role="alert">{error}</p>}

      <div className="dialog-foot">
        <Button variant="danger" onClick={() => void remove()}>
          Quitar de la biblioteca
        </Button>
      </div>
    </Dialog>
  )
}
