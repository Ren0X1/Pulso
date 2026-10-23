import { useEffect, useState, type FormEvent } from 'react'
import { Download, FolderOpen, Play, Star, X } from 'lucide-react'
import {
  formatBytes,
  installGame,
  launchGame,
  loadLauncherSettings,
  openGameFolder,
  saveLauncherSettings,
  steamAppId,
  type InstalledGame,
  type LauncherSettings,
} from '../lib/desktop.ts'
import { isDesktop } from '../lib/platform.ts'
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
import { GameAchievements } from './GameAchievements.tsx'

const MAX_TAGS = 10
const desktop = isDesktop()

export function EntryDialog({
  entry,
  userId,
  knownTags,
  installed = null,
  onClose,
  onChanged,
}: {
  entry: LibraryEntry | null
  userId: string
  knownTags: string[]
  /** Solo en el launcher: el juego instalado en este PC, si lo está. */
  installed?: InstalledGame | null
  onClose: () => void
  onChanged: () => void
}) {
  const [current, setCurrent] = useState(entry)
  const [tag, setTag] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [settings, setSettings] = useState<LauncherSettings | null>(null)
  const [launchArgs, setLaunchArgs] = useState('')
  const entryAppId = entry ? steamAppId(entry.game.external) : null

  useEffect(() => {
    setCurrent(entry)
    setTag('')
    setError(null)
  }, [entry])

  useEffect(() => {
    if (!desktop || entryAppId === null) return
    void loadLauncherSettings().then((s) => {
      setSettings(s)
      setLaunchArgs(s.launchOptions[entryAppId] ?? '')
    })
  }, [entryAppId])

  async function saveArgs() {
    if (!settings || entryAppId === null) return
    const clean = launchArgs.trim()
    if ((settings.launchOptions[entryAppId] ?? '') === clean) return
    const launchOptions = { ...settings.launchOptions }
    if (clean) launchOptions[entryAppId] = clean
    else delete launchOptions[entryAppId]
    const next = { ...settings, launchOptions }
    try {
      await saveLauncherSettings(userId, next)
      setSettings(next)
    } catch {
      setError('No se pudieron guardar los parámetros.')
    }
  }

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

  async function act(action: () => Promise<unknown>) {
    try {
      await action()
    } catch {
      setError('Steam no respondió. ¿Está instalado y abierto?')
    }
  }

  const { game } = current
  const appid = steamAppId(game.external)
  return (
    <Dialog
      open={!!entry}
      title={game.name}
      onClose={() => {
        // Cerrar con Esc o con la X no debe perder unos parámetros recién escritos.
        void saveArgs()
        onClose()
      }}
    >
      <div className="entry-head">
        <Cover game={game} />
        <div className="entry-facts">
          <p className="muted">
            {[game.release_date?.slice(0, 4), game.genres.slice(0, 3).join(', ')].filter(Boolean).join(' · ')}
          </p>
          <p>
            <span className="muted">Horas jugadas: </span>
            <span className="num">{formatPlaytime(current.playtime_minutes)}</span>
            {current.source === 'manual' && <span className="muted"> (añadido a mano: Steam no lo tiene)</span>}
          </p>
          {installed && (
            <p>
              <span className="muted">En disco: </span>
              <span className="num">{formatBytes(installed.sizeBytes)}</span>
            </p>
          )}
          {game.summary && <p className="entry-summary">{game.summary}</p>}
        </div>
      </div>

      {desktop && appid !== null && (
        <div className="row-actions">
          {installed ? (
            <>
              <Button
                onClick={() =>
                  void act(async () => {
                    await saveArgs()
                    await launchGame(appid, launchArgs)
                  })
                }
              >
                <Play size={14} strokeWidth={2} aria-hidden="true" /> Jugar
              </Button>
              <Button variant="ghost" onClick={() => void act(() => openGameFolder(appid))}>
                <FolderOpen size={14} strokeWidth={1.5} aria-hidden="true" /> Abrir carpeta
              </Button>
            </>
          ) : (
            <Button variant="ghost" onClick={() => void act(() => installGame(appid))}>
              <Download size={14} strokeWidth={1.5} aria-hidden="true" /> Instalar en Steam
            </Button>
          )}
        </div>
      )}
      {desktop && appid !== null && installed && (
        <div className="launch-args">
          <label htmlFor="launch-args" className="field-label">
            Parámetros de lanzamiento
          </label>
          <input
            id="launch-args"
            value={launchArgs}
            maxLength={512}
            spellCheck={false}
            placeholder="-novid -console -windowed …"
            onChange={(e) => setLaunchArgs(e.target.value)}
            onBlur={() => void saveArgs()}
          />
          <p className="muted kpi-note">Se pasan al juego a través de Steam al pulsar Jugar. Se guardan en tu cuenta.</p>
        </div>
      )}

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

      {current.source === 'steam' && <GameAchievements userId={userId} gameId={current.game_id} />}

      {error && <p className="notice" role="alert">{error}</p>}

      <div className="dialog-foot">
        <Button variant="danger" onClick={() => void remove()}>
          Quitar de la biblioteca
        </Button>
      </div>
    </Dialog>
  )
}
