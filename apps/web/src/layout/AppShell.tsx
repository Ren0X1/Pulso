import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useMatches } from 'react-router'
import { Activity, Bell, ChartColumn, House, Library, ListChecks, LogOut, Menu, Settings, ShieldCheck, Trophy, UserRound, Users, type LucideIcon } from 'lucide-react'
import { Avatar, Logo } from '@pulso/ui'
import { useAuth } from '../lib/auth.tsx'
import { useLive, userTopic } from '../lib/live.ts'
import { countIncoming } from '../lib/friends.ts'
import { countUnread } from '../lib/social.ts'
import { isAdmin } from '../lib/admin.ts'
import { loadLastSync, shouldAutoSync, startSync } from '../lib/steam.ts'
import { isDesktop } from '../lib/platform.ts'
import { levelFor, loadPulsoMinutes } from '../lib/level.ts'
import { NowPlaying } from './NowPlaying.tsx'

const desktop = isDesktop()
// Solo el launcher se actualiza: en la web no se descarga este código.
const UpdateBanner = lazy(async () => ({ default: (await import('./UpdateBanner.tsx')).UpdateBanner }))

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Aparece en la barra inferior del móvil. */
  phone?: boolean
  /** Solo para colas que piden acción: solicitudes de amistad recibidas. */
  count?: number
}

const MAIN: NavItem[] = [
  { to: '/', label: 'Inicio', icon: House, phone: true },
  { to: '/biblioteca', label: 'Biblioteca', icon: Library, phone: true },
  { to: '/logros', label: 'Logros', icon: Trophy, phone: true },
  { to: '/listas', label: 'Listas', icon: ListChecks },
  { to: '/amigos', label: 'Amigos', icon: Users, phone: true },
  { to: '/actividad', label: 'Actividad', icon: Activity },
  { to: '/estadisticas', label: 'Estadísticas', icon: ChartColumn },
]

export interface RouteHandle {
  title: string
}

function Tab({ item }: { item: NavItem }) {
  return (
    <NavLink to={item.to} end={item.to === '/'} className="tab">
      <span>{item.label}</span>
      {item.count ? <span className="tab-count num" aria-label={`${item.count} pendientes`}>{item.count}</span> : null}
    </NavLink>
  )
}

export function AppShell() {
  const { state, signOut } = useAuth()
  const profile = state.status === 'signed-in' ? state.profile : null
  const matches = useMatches()
  const title = (matches.at(-1)?.handle as RouteHandle | undefined)?.title ?? 'Pulso'
  const profilePath = profile ? `/u/${profile.username}` : '/ajustes'
  const me = state.status === 'signed-in' ? state.session.user.id : null
  const location = useLocation()
  const [incoming, setIncoming] = useState(0)
  const [unread, setUnread] = useState(0)
  const [admin, setAdmin] = useState(false)
  const [level, setLevel] = useState<number | null>(null)

  useEffect(() => {
    if (me) void isAdmin(me).then(setAdmin, () => setAdmin(false))
    if (me) void loadPulsoMinutes(me).then((m) => setLevel(levelFor(m).level), () => setLevel(null))
  }, [me])

  // Al abrir Pulso, la biblioteca y los logros se ponen al día solos (sigue en el servidor aunque se cierre).
  useEffect(() => {
    if (!me) return
    void loadLastSync().then((last) => {
      if (shouldAutoSync(last)) void startSync()
    }, () => {})
  }, [me])

  const recount = useCallback(async () => {
    if (!me) return
    const [friends, notifications] = await Promise.all([countIncoming(me), countUnread()])
    setIncoming(friends)
    setUnread(notifications)
  }, [me])

  useEffect(() => {
    void recount()
  }, [recount, location.pathname])
  useLive([me && userTopic(me)], recount)

  // Móvil: la barra inferior lleva las secciones principales y "Más" abre el resto.
  const [more, setMore] = useState(false)
  useEffect(() => setMore(false), [location.pathname])
  const moreItems: NavItem[] = [
    { to: profilePath, label: 'Tu perfil', icon: UserRound },
    ...MAIN.filter((i) => !i.phone),
    { to: '/ajustes', label: 'Ajustes', icon: Settings },
    ...(admin ? [{ to: '/admin', label: 'Administración', icon: ShieldCheck }] : []),
  ]

  // Inicio, la ficha de un juego y los perfiles no llevan título: su cabecera ya dice qué es.
  const ownHeader = location.pathname === '/' || /^\/(juego|u)\//.test(location.pathname)

  return (
    <div className="shell">
      <header className="topbar" data-desktop={desktop || undefined}>
        <NavLink to="/" className="topbar-logo" aria-label="Pulso, inicio">
          <Logo size={26} />
        </NavLink>
        <nav className="tabs" aria-label="Navegación principal">
          {MAIN.map((item) => (
            <Tab key={item.to} item={item.to === '/amigos' ? { ...item, count: incoming } : item} />
          ))}
        </nav>
        {profile && (
          <div className="topbar-account">
            {desktop && me && <NowPlaying userId={me} username={profile.username} />}
            <NavLink to="/notificaciones" className="icon-button bell" aria-label={unread ? `Notificaciones, ${unread} sin leer` : 'Notificaciones'}>
              <Bell size={18} strokeWidth={1.75} aria-hidden="true" />
              {unread > 0 && <span className="bell-count num">{unread}</span>}
            </NavLink>
            {admin && (
              <NavLink to="/admin" className="icon-button topbar-extra" aria-label="Administración">
                <ShieldCheck size={18} strokeWidth={1.75} aria-hidden="true" />
              </NavLink>
            )}
            <NavLink to="/ajustes" className="icon-button topbar-extra" aria-label="Ajustes">
              <Settings size={18} strokeWidth={1.75} aria-hidden="true" />
            </NavLink>
            <NavLink to={profilePath} className="account-link">
              <Avatar name={profile.username} src={profile.avatar_url} size={32} />
              <span className="account-name">{profile.username}</span>
              {level !== null && <span className="account-level" title="Nivel Pulso: sube con las horas jugadas desde el launcher">Nv {level}</span>}
            </NavLink>
            <button type="button" className="icon-button topbar-extra" onClick={() => void signOut()} aria-label="Cerrar sesión">
              <LogOut size={18} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
        )}
      </header>

      <main className="canvas">
        {desktop && (
          <Suspense fallback={null}>
            <UpdateBanner />
          </Suspense>
        )}
        {!ownHeader && <h1 className="page-title">{title}</h1>}
        <Outlet />
      </main>

      {more && (
        <>
          <button type="button" className="phone-sheet-backdrop" aria-label="Cerrar el menú" onClick={() => setMore(false)} />
          <nav className="phone-sheet" id="phone-more" aria-label="Más secciones">
            {moreItems.map((item) => {
              const Icon = item.icon
              return (
                <NavLink key={item.to} to={item.to} className="phone-sheet-item">
                  <Icon size={20} strokeWidth={1.5} aria-hidden="true" />
                  <span>{item.label}</span>
                </NavLink>
              )
            })}
            <button type="button" className="phone-sheet-item" onClick={() => void signOut()}>
              <LogOut size={20} strokeWidth={1.5} aria-hidden="true" />
              <span>Cerrar sesión</span>
            </button>
          </nav>
        </>
      )}

      <nav className="phone-nav" aria-label="Navegación">
        {MAIN.filter((i) => i.phone).map((item) => {
          const Icon = item.icon
          return (
            <NavLink key={item.label} to={item.to} end={item.to === '/'} className="phone-nav-item">
              <Icon size={20} strokeWidth={1.5} aria-hidden="true" />
              <span>{item.label}</span>
              {item.to === '/amigos' && incoming > 0 && <span className="phone-nav-count num">{incoming}</span>}
            </NavLink>
          )
        })}
        <button type="button" className="phone-nav-item" aria-expanded={more} aria-controls="phone-more" onClick={() => setMore((m) => !m)}>
          <Menu size={20} strokeWidth={1.5} aria-hidden="true" />
          <span>Más</span>
        </button>
      </nav>
    </div>
  )
}
