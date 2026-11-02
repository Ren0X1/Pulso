import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ArrowLeft, Pencil, Play, Plus } from 'lucide-react'
import { Avatar, Button } from '@pulso/ui'
import { useAuth } from '../lib/auth.tsx'
import { installedGames, launchGame, steamAppId, type InstalledGame } from '../lib/desktop.ts'
import { isDesktop } from '../lib/platform.ts'
import { addToLibrary, loadMyTags, STATUS_LABELS } from '../lib/library.ts'
import { loadGameAchievements, type GameAchievement } from '../lib/achievements.ts'
import { latestUnlocked, loadGamePage, missingAchievements, type GamePageData } from '../lib/game.ts'
import { shortHours, steamHeroUrl } from '../lib/home.ts'
import { loadNews, type NewsItem } from '../lib/news.ts'
import { rarityLabel } from '../lib/steam.ts'
import { EntryDialog } from './EntryDialog.tsx'
import { GameAchievements } from './GameAchievements.tsx'
import { NewsList } from './NewsList.tsx'
import { EmptyState } from './EmptyState.tsx'

const desktop = isDesktop()
type Tab = 'resumen' | 'logros' | 'noticias'

function AchievementRow({ a, note }: { a: GameAchievement; note: string }) {
  const secret = a.hidden && a.unlocked_at === undefined
  const icon = a.unlocked_at === undefined ? (a.icon_locked_url ?? a.icon_url) : a.icon_url
  return (
    <li className="ach-row">
      {icon ? <img className="ach-icon" src={icon} alt="" loading="lazy" /> : <span className="ach-icon" aria-hidden="true" />}
      <div className="ach-meta">
        <span className="ach-name">{secret ? 'Logro oculto' : a.name}</span>
        <span className="muted ach-desc">{secret ? 'Se revela al conseguirlo' : (a.description ?? '')}</span>
      </div>
      <span className="pill mono">{note}</span>
    </li>
  )
}

function rarity(a: GameAchievement): string {
  if (a.global_percent === null) return '—'
  const label = rarityLabel(a.global_percent)
  return `${a.global_percent.toLocaleString('es', { maximumFractionDigits: 1 })} %${label ? ` · ${label.toLowerCase()}` : ''}`
}

export function GamePage() {
  const { id } = useParams()
  const gameId = Number(id)
  const { state } = useAuth()
  const me = state.status === 'signed-in' ? state.session.user.id : ''
  const [data, setData] = useState<GamePageData | null | undefined>(undefined)
  const [achievements, setAchievements] = useState<GameAchievement[] | null>(null)
  const [news, setNews] = useState<NewsItem[] | null>(null)
  const [tab, setTab] = useState<Tab>('resumen')
  const [editing, setEditing] = useState(false)
  const [tags, setTags] = useState<string[]>([])
  const [installed, setInstalled] = useState<InstalledGame | null>(null)
  const [art, setArt] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    if (!me || !Number.isInteger(gameId)) return setData(null)
    const page = await loadGamePage(me, gameId)
    setData(page)
    if (!page) return
    const appid = steamAppId(page.game.external)
    setArt(appid ? steamHeroUrl(appid) : page.game.cover_url)
    void loadGameAchievements(me, gameId).then(setAchievements, () => setAchievements([]))
    void (appid ? loadNews([appid], 8) : Promise.resolve([])).then(setNews)
    if (desktop && appid) void installedGames().then((list) => setInstalled(list.find((g) => g.appid === appid) ?? null), () => {})
  }, [me, gameId])

  useEffect(() => {
    setData(undefined)
    setAchievements(null)
    setNews(null)
    setTab('resumen')
    void load()
  }, [load])
  useEffect(() => {
    if (me) void loadMyTags(me).then(setTags, () => {})
  }, [me])

  if (data === undefined) return <p className="muted">Cargando…</p>
  if (data === null) {
    return (
      <EmptyState title="No encontramos ese juego">
        <Link to="/biblioteca">Volver a tu biblioteca</Link>
      </EmptyState>
    )
  }

  const { game, entry } = data
  const appid = steamAppId(game.external)
  const year = game.release_date ? new Date(game.release_date).getFullYear() : null
  const maxMinutes = Math.max(1, entry?.playtime_minutes ?? 0, ...data.friends.map((f) => f.minutes))
  const missing = achievements ? missingAchievements(achievements) : []
  const latest = achievements ? latestUnlocked(achievements) : []

  return (
    <div className="game-page">
      <section className="game-hero" aria-label={game.name}>
        {art && <img className="hero-art" src={art} alt="" onError={() => setArt(art === game.cover_url ? null : game.cover_url)} />}
        <div className="hero-shade" aria-hidden="true" />
        <Link to="/biblioteca" className="game-back">
          <ArrowLeft size={16} strokeWidth={1.75} aria-hidden="true" /> Biblioteca
        </Link>
        <div className="hero-body">
          <div className="game-chips">
            {entry && <span className="pill">{STATUS_LABELS[entry.status]}</span>}
            {installed && <span className="pill game-chip-light">Instalado</span>}
            {year && <span className="pill">{year}</span>}
            {game.genres.slice(0, 2).map((g) => (
              <span key={g} className="pill">
                {g}
              </span>
            ))}
          </div>
          <h1 className="hero-title">{game.name}</h1>
          <div className="hero-actions">
            {appid &&
              (desktop ? (
                <button type="button" className="p-button hero-play" data-variant="primary" onClick={() => void launchGame(appid)}>
                  <Play size={16} strokeWidth={2} aria-hidden="true" /> Jugar
                </button>
              ) : (
                <a className="p-button hero-play" data-variant="primary" href={`steam://run/${appid}`}>
                  <Play size={16} strokeWidth={2} aria-hidden="true" /> Jugar en Steam
                </a>
              ))}
            {entry ? (
              <Button variant="ghost" onClick={() => setEditing(true)}>
                <Pencil size={14} strokeWidth={1.75} aria-hidden="true" /> Estado, etiquetas{desktop ? ' y parámetros' : ''}
              </Button>
            ) : (
              <Button
                variant="ghost"
                busy={adding}
                onClick={() => {
                  setAdding(true)
                  void addToLibrary(me, game.id).then(load).finally(() => setAdding(false))
                }}
              >
                <Plus size={14} strokeWidth={1.75} aria-hidden="true" /> Añadir a mi biblioteca
              </Button>
            )}
          </div>
        </div>
      </section>

      <nav className="game-tabs" aria-label="Secciones del juego">
        {(
          [
            ['resumen', 'Resumen'],
            ['logros', data.total ? `Logros · ${data.unlocked}/${data.total}` : 'Logros'],
            ['noticias', 'Noticias'],
          ] as const
        ).map(([key, label]) => (
          <button key={key} type="button" className="tab" aria-current={tab === key ? 'page' : undefined} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </nav>

      {tab === 'resumen' && (
        <>
          <section className="game-stats" aria-label="Tus números">
            <div>
              <span className="muted">Horas</span>
              <span className="mono">{entry ? shortHours(entry.playtime_minutes ?? 0) : '—'}</span>
            </div>
            <div>
              <span className="muted">Logros</span>
              <span className="mono game-accent">{data.total ? `${data.unlocked}/${data.total}` : '—'}</span>
            </div>
            <div>
              <span className="muted">Última partida</span>
              <span className="mono">
                {entry?.last_played_at ? new Date(entry.last_played_at).toLocaleDateString('es', { day: 'numeric', month: 'short' }) : '—'}
              </span>
            </div>
            <div>
              <span className="muted">Amigos que lo tienen</span>
              <span className="mono">{data.friends.length}</span>
            </div>
          </section>

          <div className="game-columns">
            <section className="panel" aria-label="Logros">
              <h2 className="panel-title">
                {data.total === 0
                  ? 'Logros'
                  : data.unlocked === data.total
                    ? '¡Platino! Tienes todos los logros'
                    : `Te faltan ${data.total - data.unlocked} para el platino`}
              </h2>
              {achievements === null ? (
                <p className="muted">Cargando…</p>
              ) : achievements.length === 0 ? (
                <p className="muted">Este juego no tiene logros en Steam (o aún no se han sincronizado).</p>
              ) : (
                <>
                  {missing.length > 0 && (
                    <>
                      <h3 className="game-sub">Los más raros que te faltan</h3>
                      <ul className="ach-list">
                        {missing.map((a) => (
                          <AchievementRow key={a.id} a={a} note={rarity(a)} />
                        ))}
                      </ul>
                    </>
                  )}
                  {latest.length > 0 && (
                    <>
                      <h3 className="game-sub">Los últimos que conseguiste</h3>
                      <ul className="ach-list">
                        {latest.map((a) => (
                          <AchievementRow
                            key={a.id}
                            a={a}
                            note={new Date(a.unlocked_at as string).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}
                          />
                        ))}
                      </ul>
                    </>
                  )}
                  <button type="button" className="link-button game-more" onClick={() => setTab('logros')}>
                    Ver todos los logros
                  </button>
                </>
              )}
            </section>

            <section className="panel" aria-label="Tus amigos y este juego">
              <h2 className="panel-title">Tus amigos y {game.name}</h2>
              {data.friends.length === 0 ? (
                <p className="muted">Ninguno de tus amigos lo tiene (o su biblioteca es privada).</p>
              ) : (
                <ul className="game-friends">
                  {entry && (
                    <li>
                      <Avatar name={state.status === 'signed-in' ? (state.profile?.username ?? 'Tú') : 'Tú'} src={state.status === 'signed-in' ? state.profile?.avatar_url : null} size={36} />
                      <span className="game-friend-name">Tú</span>
                      <span className="level-bar">
                        <span style={{ width: `${Math.round(((entry.playtime_minutes ?? 0) / maxMinutes) * 100)}%` }} />
                      </span>
                      <span className="mono">{shortHours(entry.playtime_minutes ?? 0)}</span>
                    </li>
                  )}
                  {data.friends.map((f) => (
                    <li key={f.id}>
                      <Avatar name={f.username} src={f.avatar_url} size={36} />
                      <Link to={`/u/${f.username}`} className="game-friend-name">
                        {f.username}
                      </Link>
                      <span className="level-bar" data-muted="">
                        <span style={{ width: `${Math.round((f.minutes / maxMinutes) * 100)}%` }} />
                      </span>
                      <span className="mono">{shortHours(f.minutes)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}

      {tab === 'logros' && (
        <section className="panel">
          <GameAchievements userId={me} gameId={game.id} />
        </section>
      )}

      {tab === 'noticias' && (
        <section className="panel">
          {appid ? <NewsList news={news} /> : <p className="muted">Este juego no es de Steam: no hay anuncios que enseñar.</p>}
        </section>
      )}

      <EntryDialog
        entry={editing ? entry : null}
        userId={me}
        knownTags={tags}
        installed={installed}
        onClose={() => setEditing(false)}
        onChanged={() => void load()}
      />
    </div>
  )
}
