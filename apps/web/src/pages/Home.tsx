import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { ExternalLink, Play, Plus } from 'lucide-react'
import { Avatar } from '@pulso/ui'
import { useAuth } from '../lib/auth.tsx'
import { useLive, userTopic } from '../lib/live.ts'
import { supabase } from '../lib/supabase.ts'
import { countIncoming } from '../lib/friends.ts'
import { isDesktop } from '../lib/platform.ts'
import { launchGame, steamAppId } from '../lib/desktop.ts'
import {
  countUnplayed,
  loadHero,
  loadPinned,
  loadRecent,
  loadWeek,
  shortHours,
  steamHeroUrl,
  type HeroGame,
  type HomeEntry,
  type WeekDay,
} from '../lib/home.ts'
import { Cover } from './Cover.tsx'
import { SyncSteam } from './SyncSteam.tsx'
import { FriendsFeed } from './FriendsFeed.tsx'
import { DownloadLauncher } from '../layout/DownloadLauncher.tsx'
import { levelFor, loadPulsoMinutes } from '../lib/level.ts'
import { loadNews, type NewsItem } from '../lib/news.ts'
import { NewsList } from './NewsList.tsx'

interface SteamAccount {
  external_user_id: string
  display_name: string | null
  avatar_url: string | null
  profile_visibility: 'public' | 'private' | null
}

const STEAM_PRIVACY_URL = 'https://steamcommunity.com/my/edit/settings'
const desktop = isDesktop()

function Pinned({ games }: { games: HomeEntry[] }) {
  return (
    <section className="pinned" aria-label="Fijados">
      <span className="pinned-label">Fijados</span>
      {games.map((g) => (
        <Link key={g.game_id} to={`/juego/${g.game_id}`} className="pinned-chip">
          <Cover game={g.game} small />
          <span>{g.game.name}</span>
        </Link>
      ))}
      <Link to="/biblioteca?favoritos=1" className="pinned-add" aria-label="Elegir juegos fijados (tus favoritos)">
        <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
      </Link>
    </section>
  )
}

function PlayButton({ appid }: { appid: number | null }) {
  if (!appid) return null
  if (desktop) {
    return (
      <button type="button" className="p-button hero-play" data-variant="primary" onClick={() => void launchGame(appid)}>
        <Play size={16} strokeWidth={2} aria-hidden="true" /> Jugar
      </button>
    )
  }
  return (
    <a className="p-button hero-play" data-variant="primary" href={`steam://run/${appid}`}>
      <Play size={16} strokeWidth={2} aria-hidden="true" /> Jugar en Steam
    </a>
  )
}

function Hero({ hero }: { hero: HeroGame }) {
  const { entry, appid } = hero
  const [art, setArt] = useState<string | null>(appid ? steamHeroUrl(appid) : entry.game.cover_url)
  useEffect(() => setArt(appid ? steamHeroUrl(appid) : entry.game.cover_url), [appid, entry.game.cover_url])
  const ago = entry.last_played_at ? new Date(entry.last_played_at).toLocaleDateString('es', { day: 'numeric', month: 'short' }) : null

  return (
    <section className="hero" aria-label="Sigues jugando">
      {art && (
        <img
          className="hero-art"
          src={art}
          alt=""
          onError={() => setArt(art === entry.game.cover_url ? null : entry.game.cover_url)}
        />
      )}
      <div className="hero-shade" aria-hidden="true" />
      <div className="hero-body">
        <p className="hero-kicker">{ago ? `Seguir jugando · última partida el ${ago}` : 'De tu biblioteca'}</p>
        <h1 className="hero-title">{entry.game.name}</h1>
        <div className="hero-row">
          <div className="hero-actions">
            <PlayButton appid={appid} />
            <Link className="p-button" data-variant="ghost" to={`/juego/${entry.game_id}`}>
              Ficha del juego
            </Link>
          </div>
          <dl className="hero-stats">
            <div>
              <dt>jugadas</dt>
              <dd className="mono">{shortHours(entry.playtime_minutes ?? 0)}</dd>
            </div>
            {hero.total > 0 && (
              <div>
                <dt>logros</dt>
                <dd className="mono hero-accent">
                  {hero.unlocked}/{hero.total}
                </dd>
              </div>
            )}
            <div>
              <dt>lo tienen en Pulso</dt>
              <dd className="mono">{hero.owners}</dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  )
}

function Week({ days, pulsoMinutes }: { days: WeekDay[] | null; pulsoMinutes: number | null }) {
  const total = days?.reduce((sum, d) => sum + d.minutes, 0) ?? 0
  const max = Math.max(60, ...(days ?? []).map((d) => d.minutes))
  return (
    <section className="panel week" aria-label="Tu semana">
      <div className="panel-title-row">
        <h2 className="panel-title">Tu semana</h2>
        <span className="muted week-note">Partidas con el launcher</span>
      </div>
      {days === null ? (
        <p className="muted">Cargando…</p>
      ) : (
        <>
          <p className="week-total mono">{shortHours(total)}</p>
          <ol className="week-bars" aria-label="Minutos jugados por día">
            {days.map((d) => (
              <li key={d.label} data-today={d.today || undefined} title={`${shortHours(d.minutes)}`}>
                <span className="week-bar" style={{ height: d.minutes ? `${Math.max(6, Math.round((d.minutes / max) * 100))}%` : '2px' }} />
                <span className="week-day">{d.label}</span>
                <span className="visually-hidden">{shortHours(d.minutes)}</span>
              </li>
            ))}
          </ol>
          {total === 0 && (
            <p className="muted week-empty">
              {desktop
                ? 'Aún no has jugado esta semana desde Pulso.'
                : 'Juega desde el launcher de Pulso y aquí verás tus horas de cada día.'}
            </p>
          )}
        </>
      )}
      {pulsoMinutes !== null && <Level minutes={pulsoMinutes} />}
    </section>
  )
}

/** Nivel Pulso: sube con las horas jugadas desde el launcher. */
function Level({ minutes }: { minutes: number }) {
  const { level, progress, hoursToNext } = levelFor(minutes)
  return (
    <div className="week-level">
      <div className="week-level-row">
        <span>
          Nivel Pulso <span className="mono">{level}</span>
        </span>
        <span className="muted">
          {hoursToNext} h para el {level + 1}
        </span>
      </div>
      <div className="level-bar" role="progressbar" aria-label="Progreso al siguiente nivel" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
        <span style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
    </div>
  )
}

function Shelf({ games, unplayed }: { games: HomeEntry[] | null; unplayed: number }) {
  return (
    <section className="shelf" aria-label="Continúa">
      <div className="panel-title-row">
        <h2 className="section-title">Continúa</h2>
        <Link to="/biblioteca">Toda la biblioteca</Link>
      </div>
      {games === null ? (
        <p className="muted">Cargando…</p>
      ) : games.length === 0 ? (
        <p className="muted">
          Aún no hay juegos en tu biblioteca. Sincroniza con Steam o <Link to="/biblioteca">añade uno del catálogo</Link>.
        </p>
      ) : (
        <ul className="shelf-row">
          {games.map((g) => (
            <li key={g.game_id} className="shelf-item">
              <Link to={`/juego/${g.game_id}`} className="shelf-link">
                <Cover game={g.game} />
                <span className="shelf-name">{g.game.name}</span>
                <span className="shelf-meta mono">{shortHours(g.playtime_minutes ?? 0)}</span>
              </Link>
            </li>
          ))}
          {unplayed > 0 && (
            <li className="shelf-item">
              <Link to="/biblioteca?orden=name" className="shelf-unplayed">
                <span className="mono">{unplayed.toLocaleString('es')}</span>
                <span>sin estrenar</span>
              </Link>
            </li>
          )}
        </ul>
      )}
    </section>
  )
}

export function Home() {
  const { state } = useAuth()
  const me = state.status === 'signed-in' ? state.session.user.id : ''
  const [account, setAccount] = useState<SteamAccount | null | undefined>(undefined)
  const [recent, setRecent] = useState<HomeEntry[] | null>(null)
  const [pinned, setPinned] = useState<HomeEntry[]>([])
  // undefined mientras carga: así no se ve el mensaje de cuenta vacía durante un instante.
  const [hero, setHero] = useState<HeroGame | null | undefined>(undefined)
  const [week, setWeek] = useState<WeekDay[] | null>(null)
  const [unplayed, setUnplayed] = useState(0)
  const [incoming, setIncoming] = useState(0)
  const [pulsoMinutes, setPulsoMinutes] = useState<number | null>(null)
  const [news, setNews] = useState<NewsItem[] | null>(null)

  const load = useCallback(async () => {
    if (!supabase || !me) return
    const [recentGames, pinnedGames, weekDays, notPlayed, account, minutes] = await Promise.all([
      loadRecent(me),
      loadPinned(me),
      loadWeek(me),
      countUnplayed(me),
      supabase.from('linked_accounts').select('external_user_id, display_name, avatar_url, profile_visibility').eq('platform', 'steam').maybeSingle(),
      loadPulsoMinutes(me),
    ])
    setPulsoMinutes(minutes)
    // Las novedades salen de los juegos a los que juegas últimamente.
    const appids = recentGames.map((g) => steamAppId(g.game.external)).filter((a): a is number => a !== null)
    void loadNews(appids.slice(0, 8), 4).then(setNews)
    setRecent(recentGames)
    setPinned(pinnedGames)
    setWeek(weekDays)
    setUnplayed(notPlayed)
    setAccount((account.data as SteamAccount | null) ?? null)
    setHero(recentGames[0] ? await loadHero(me, recentGames[0]) : null)
  }, [me])

  useEffect(() => {
    void load()
    if (me) void countIncoming(me).then(setIncoming)
  }, [load, me])
  useLive([me && userTopic(me)], () => countIncoming(me).then(setIncoming))

  const isPrivate = account?.profile_visibility === 'private'
  const shelf = hero === undefined ? null : (recent?.slice(hero ? 1 : 0, 8) ?? null)

  return (
    <div className="home">
      {pinned.length > 0 && <Pinned games={pinned} />}

      <div className="home-top">
        {hero === undefined ? (
          <section className="hero" aria-label="Cargando" aria-busy="true" />
        ) : hero ? (
          <Hero hero={hero} />
        ) : (
          <section className="hero hero-empty" aria-label="Empieza">
            <div className="hero-body">
              <h1 className="hero-title">Tu biblioteca, en un sitio</h1>
              <p className="muted">Sincroniza con Steam para traer tus juegos, tus horas y tus logros.</p>
            </div>
          </section>
        )}
        <Week days={week} pulsoMinutes={pulsoMinutes} />
      </div>

      {incoming > 0 && (
        <p className="notice notice-neutral">
          Tienes {incoming} {incoming === 1 ? 'solicitud' : 'solicitudes'} de amistad. <Link to="/amigos">Responder</Link>
        </p>
      )}

      <Shelf games={shelf} unplayed={unplayed} />

      <div className="home-columns">
        {me && <FriendsFeed me={me} limit={6} />}

        <section className="panel" aria-label="Novedades de tus juegos">
          <h2 className="panel-title">Novedades de tus juegos</h2>
          <NewsList news={news} names={new Map((recent ?? []).map((g) => [steamAppId(g.game.external) ?? -1, g.game.name]))} />
        </section>
      </div>

      <div className="home-columns">
        <section className="panel" aria-label="Tu cuenta de Steam">
          <h2 className="panel-title">Tu cuenta de Steam</h2>
          {account === undefined ? (
            <p className="muted">Cargando…</p>
          ) : account === null ? (
            <p className="muted">No hay ninguna cuenta de Steam vinculada.</p>
          ) : (
            <>
              <div className="steam-row">
                <Avatar name={account.display_name ?? 'Steam'} src={account.avatar_url} size={44} />
                <div className="steam-meta">
                  <p className="steam-name">{account.display_name ?? 'Sin nombre'}</p>
                  <p className="muted">
                    {account.profile_visibility === 'private' ? 'Perfil privado' : 'Perfil público'} ·{' '}
                    <a href={`https://steamcommunity.com/profiles/${account.external_user_id}`} target="_blank" rel="noreferrer">
                      Ver en Steam <ExternalLink size={12} strokeWidth={1.5} aria-hidden="true" />
                    </a>
                  </p>
                </div>
              </div>
              <div className="steam-sync-slot">
                <SyncSteam onSynced={() => void load()} />
              </div>
            </>
          )}
          {isPrivate && (
            <p className="steam-help">
              Tu perfil de Steam es privado: en Steam, abre{' '}
              <a href={STEAM_PRIVACY_URL} target="_blank" rel="noreferrer">
                Editar perfil → Privacidad
              </a>{' '}
              y pon <strong>Mi perfil</strong> y <strong>Detalles de juego</strong> en <strong>Público</strong>.
            </p>
          )}
          {!desktop && <DownloadLauncher />}
        </section>
      </div>
    </div>
  )
}

