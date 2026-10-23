import type { ComponentType } from 'react'
import { createBrowserRouter, Navigate, Outlet } from 'react-router'
import { AppShell, type RouteHandle } from './layout/AppShell.tsx'
import { useAuth } from './lib/auth.tsx'
import { AuthCallback } from './pages/AuthCallback.tsx'
import { ErrorScreen } from './pages/ErrorScreen.tsx'
import { Login } from './pages/Login.tsx'

function RequireSession() {
  const { state } = useAuth()
  if (state.status === 'loading') return <p className="boot muted">Cargando…</p>
  if (state.status !== 'signed-in') return <Navigate to="/login" replace />
  return <Outlet />
}

const handle = (title: string): RouteHandle => ({ title })

// Cada pantalla se descarga al visitarla, no todas al abrir la app.
const page = (title: string, load: () => Promise<ComponentType>) => ({
  handle: handle(title),
  lazy: async () => ({ Component: await load() }),
})

export const router = createBrowserRouter([
  {
    // Si cualquier pantalla falla, mensaje y salida en vez de una página en blanco.
    errorElement: <ErrorScreen />,
    children: [
      { path: '/login', element: <Login /> },
      { path: '/auth/callback', element: <AuthCallback /> },
      {
        element: <RequireSession />,
        children: [
          {
            element: <AppShell />,
            children: [
              { index: true, ...page('Inicio', async () => (await import('./pages/Home.tsx')).Home) },
              { path: 'biblioteca', ...page('Biblioteca', async () => (await import('./pages/Library.tsx')).LibraryPage) },
              { path: 'listas', ...page('Listas', async () => (await import('./pages/Lists.tsx')).ListsPage) },
              { path: 'listas/:id', ...page('Lista', async () => (await import('./pages/ListDetail.tsx')).ListDetailPage) },
              { path: 'actividad', ...page('Actividad', async () => (await import('./pages/Activity.tsx')).ActivityPage) },
              { path: 'logros', ...page('Logros', async () => (await import('./pages/Achievements.tsx')).AchievementsPage) },
              { path: 'amigos', ...page('Amigos', async () => (await import('./pages/Friends.tsx')).FriendsPage) },
              { path: 'u/:username', ...page('Perfil', async () => (await import('./pages/Profile.tsx')).ProfilePage) },
              { path: 'u/:username/comparar', ...page('Comparar', async () => (await import('./pages/Compare.tsx')).ComparePage) },
              {
                path: 'notificaciones',
                ...page('Notificaciones', async () => (await import('./pages/Notifications.tsx')).NotificationsPage),
              },
              { path: 'ajustes', ...page('Ajustes', async () => (await import('./pages/Settings.tsx')).SettingsPage) },
            ],
          },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])
