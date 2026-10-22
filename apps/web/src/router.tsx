import { createBrowserRouter, Navigate, Outlet } from 'react-router'
import { AppShell, type RouteHandle } from './layout/AppShell.tsx'
import { useAuth } from './lib/auth.tsx'
import { AuthCallback } from './pages/AuthCallback.tsx'
import { Home } from './pages/Home.tsx'
import { Login } from './pages/Login.tsx'
import { ProfilePage } from './pages/Profile.tsx'
import { FriendsPage } from './pages/Friends.tsx'
import { LibraryPage } from './pages/Library.tsx'
import { ListDetailPage } from './pages/ListDetail.tsx'
import { ListsPage } from './pages/Lists.tsx'
import { AchievementsPage, ActivityPage } from './pages/Sections.tsx'
import { SettingsPage } from './pages/Settings.tsx'

function RequireSession() {
  const { state } = useAuth()
  if (state.status === 'loading') return <p className="boot muted">Cargando…</p>
  if (state.status !== 'signed-in') return <Navigate to="/login" replace />
  return <Outlet />
}

const handle = (title: string): RouteHandle => ({ title })

export const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  { path: '/auth/callback', element: <AuthCallback /> },
  {
    element: <RequireSession />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <Home />, handle: handle('Inicio') },
          { path: 'biblioteca', element: <LibraryPage />, handle: handle('Biblioteca') },
          { path: 'listas', element: <ListsPage />, handle: handle('Listas') },
          { path: 'listas/:id', element: <ListDetailPage />, handle: handle('Lista') },
          { path: 'actividad', element: <ActivityPage />, handle: handle('Actividad') },
          { path: 'logros', element: <AchievementsPage />, handle: handle('Logros') },
          { path: 'amigos', element: <FriendsPage />, handle: handle('Amigos') },
          { path: 'u/:username', element: <ProfilePage />, handle: handle('Perfil') },
          { path: 'ajustes', element: <SettingsPage />, handle: handle('Ajustes') },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
