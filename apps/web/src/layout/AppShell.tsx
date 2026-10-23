import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useMatches } from 'react-router'
import { Activity, Bell, House, Library, ListChecks, LogOut, Settings, Trophy, UserRound, Users, type LucideIcon } from 'lucide-react'
import { Avatar, Logo, PulseMark } from '@pulso/ui'
import { useAuth } from '../lib/auth.tsx'
import { countIncoming } from '../lib/friends.ts'
import { countUnread } from '../lib/social.ts'
import { isDesktop } from '../lib/platform.ts'
import { NowPlaying } from './NowPlaying.tsx'
import { UpdateBanner } from './UpdateBanner.tsx'

const desktop = isDesktop()

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

  useEffect(() => {
    if (me) void countIncoming(me).then(setIncoming)
    if (me) void countUnread().then(setUnread)
  }, [me, location.pathname])

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
      </aside>

      <header className="topbar">
        <div className="topbar-start">
          <span className="phone-mark">
            <PulseMark size={20} />
          </span>
          <h1 className="topbar-title">{title}</h1>
        </div>
        {desktop && me && <NowPlaying userId={me} />}
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
        {desktop && <UpdateBanner />}
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
