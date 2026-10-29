import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useMatches } from 'react-router'
import { Activity, Bell, ChartColumn, House, Library, ListChecks, LogOut, Settings, Trophy, UserRound, Users, type LucideIcon } from 'lucide-react'
import { Avatar, Logo, PulseMark } from '@pulso/ui'
import { useAuth } from '../lib/auth.tsx'
import { useLive, userTopic } from '../lib/live.ts'
import { countIncoming } from '../lib/friends.ts'
import { countUnread } from '../lib/social.ts'
import { isDesktop } from '../lib/platform.ts'
import { NowPlaying } from './NowPlaying.tsx'
import { DownloadLauncher } from './DownloadLauncher.tsx'


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
  { to: '/listas', label: 'Listas', icon: ListChecks },
  { to: '/actividad', label: 'Actividad', icon: Activity },
  { to: '/logros', label: 'Logros', icon: Trophy, phone: true },
  { to: '/estadisticas', label: 'Estadísticas', icon: ChartColumn },
  { to: '/amigos', label: 'Amigos', icon: Users, phone: true },
]

export interface RouteHandle {
  title: string
}

function NavRow({ item }: { item: NavItem }) {
  const Icon = item.icon
  return (
    <NavLink to={item.to} end={item.to === '/'} className="nav-row">
      <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
      <span>{item.label}</span>
      {item.count ? <span className="nav-count num" aria-label={`${item.count} pendientes`}>{item.count}</span> : null}
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

  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Navegación principal">
        <NavLink to="/" className="sidebar-logo" aria-label="Pulso, inicio">
          <Logo />
        </NavLink>
        <nav className="sidebar-nav">
          {MAIN.map((item) => (
            <NavRow key={item.to} item={item.to === '/amigos' ? { ...item, count: incoming } : item} />
          ))}
          <p className="nav-group">Tú</p>
          <NavRow item={{ to: profilePath, label: 'Perfil', icon: UserRound }} />
          <NavRow item={{ to: '/ajustes', label: 'Ajustes', icon: Settings }} />
        </nav>
        <DownloadLauncher />
      </aside>

      <header className="topbar">
        <div className="topbar-start">
          <span className="phone-mark">
            <PulseMark size={20} />
          </span>
          <h1 className="topbar-title">{title}</h1>
        </div>
        {desktop && me && profile && <NowPlaying userId={me} username={profile.username} />}
        {profile && (
          <div className="topbar-account">
            <NavLink to="/notificaciones" className="icon-button bell" aria-label={unread ? `Notificaciones, ${unread} sin leer` : "Notificaciones"}>
              <Bell size={16} strokeWidth={1.5} aria-hidden="true" />
              {unread > 0 && <span className="bell-count num">{unread}</span>}
            </NavLink>
            <NavLink to={profilePath} className="account-link">
              <Avatar name={profile.username} src={profile.avatar_url} size={28} />
              <span className="account-name">{profile.username}</span>
            </NavLink>
            <button type="button" className="icon-button" onClick={() => void signOut()} aria-label="Cerrar sesión">
              <LogOut size={16} strokeWidth={1.5} aria-hidden="true" />
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
        <Outlet />
      </main>

      <nav className="phone-nav" aria-label="Navegación">
        {[...MAIN.filter((i) => i.phone), { to: profilePath, label: 'Perfil', icon: UserRound }].map((item) => {
          const Icon = item.icon
          return (
            <NavLink key={item.label} to={item.to} end={item.to === '/'} className="phone-nav-item">
              <Icon size={20} strokeWidth={1.5} aria-hidden="true" />
              <span>{item.label}</span>
            </NavLink>
          )
        })}
      </nav>
    </div>
  )
}
