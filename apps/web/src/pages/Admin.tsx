import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router'
import { Avatar, Button } from '@pulso/ui'
import { useAuth } from '../lib/auth.tsx'
import {
  adminErrorMessage,
  cancelSync,
  forceSync,
  grantAdmin,
  isAdmin,
  loadOverview,
  revokeAdmin,
  runLabel,
  type AdminOverview,
  type AdminUser,
} from '../lib/admin.ts'

const n = (value: number) => value.toLocaleString('es')

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="kpi-label">{label}</p>
      <p className="kpi-value num">{value}</p>
    </div>
  )
}

/** Panel de administración: solo para quien está en app_admins (el servidor lo vuelve a comprobar en cada acción). */
export function AdminPage() {
  const { state } = useAuth()
  const me = state.status === 'signed-in' ? state.session.user.id : ''
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [data, setData] = useState<AdminOverview | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setData(await loadOverview())
    } catch (err) {
      setError(adminErrorMessage(err))
    }
  }, [])

  useEffect(() => {
    void isAdmin(me).then((ok) => {
      setAllowed(ok)
      if (ok) void reload()
    })
  }, [me, reload])

  // Mientras alguien sincroniza, el progreso se refresca cada 5 s; si no, cada 30 s.
  const syncing = (data?.stats.running ?? 0) > 0
  useEffect(() => {
    if (!allowed) return
    const timer = setInterval(() => void reload(), syncing ? 5_000 : 30_000)
    return () => clearInterval(timer)
  }, [allowed, syncing, reload])

  async function act(key: string, action: () => Promise<unknown>) {
    setBusy(key)
    setError(null)
    try {
      await action()
      await reload()
    } catch (err) {
      setError(adminErrorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  if (allowed === false) return <Navigate to="/" replace />
  if (!data) return error ? <p className="notice" role="alert">{error}</p> : <p className="muted">Cargando…</p>

  const { stats } = data
  const syncAll = data.users.filter((u) => u.steam_id && u.run?.status !== 'running')

  return (
    <div className="stack">
      <section className="panel" aria-label="Resumen de la app">
        <div className="kpis">
          <Kpi label="Usuarios" value={n(stats.users)} />
          <Kpi label="Juegos en bibliotecas" value={n(stats.library)} />
          <Kpi label="Logros conseguidos" value={n(stats.achievements)} />
        </div>
        <div className="kpis">
          <Kpi label="Juegos en el catálogo" value={n(stats.catalog)} />
          <Kpi label="Listas" value={n(stats.lists)} />
          <Kpi label="Sincronizando ahora · fallos en 24 h" value={`${n(stats.running)} · ${n(stats.errors)}`} />
        </div>
      </section>

      {error && <p className="notice" role="alert">{error}</p>}

      <section className="panel" aria-label="Usuarios">
        <div className="panel-title-row">
          <h2 className="panel-title">
            Usuarios <span className="count num">{data.users.length}</span>
          </h2>
          <Button
            variant="ghost"
            busy={busy === 'all'}
            disabled={syncAll.length === 0}
            onClick={() => void act('all', () => Promise.all(syncAll.map((u) => forceSync(u.id))))}
          >
            Sincronizar a todos
          </Button>
        </div>
        <div className="admin-scroll">
          <table className="library-table admin-table">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Steam</th>
                <th className="num">Juegos</th>
                <th className="num">Logros</th>
                <th>Sincronización</th>
                <th>
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((u) => (
                <UserRow key={u.id} user={u} me={me} busy={busy} act={act} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel" aria-label="Últimas sincronizaciones">
        <h2 className="panel-title">Últimas sincronizaciones</h2>
        {data.runs.length === 0 ? (
          <p className="muted">Nadie ha sincronizado todavía.</p>
        ) : (
          <ul className="admin-runs">
            {data.runs.map((r) => (
              <li key={r.id}>
                <span className="admin-runs-user">{r.username ?? 'Usuario borrado'}</span>
                <span className="muted">{runLabel(r)}</span>
                {r.forced_by && <span className="pill">Forzada</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function UserRow({
  user: u,
  me,
  busy,
  act,
}: {
  user: AdminUser
  me: string
  busy: string | null
  act: (key: string, action: () => Promise<unknown>) => Promise<void>
}) {
  const running = u.run?.status === 'running'
  return (
    <tr>
      <td>
        <Link to={`/u/${u.username}`} className="player-link">
          <Avatar name={u.username} src={u.avatar_url} size={28} />
          <span>{u.username}</span>
        </Link>
        {u.is_admin && <span className="pill admin-pill">Admin</span>}
      </td>
      <td>
        {u.steam_id ? (
          <a href={`https://steamcommunity.com/profiles/${u.steam_id}`} target="_blank" rel="noreferrer">
            {u.steam_name ?? u.steam_id}
          </a>
        ) : (
          <span className="muted">Sin Steam</span>
        )}
        {u.profile_visibility === 'private' && (
          <span className="pill admin-pill" data-tone="warning">
            Privado
          </span>
        )}
      </td>
      <td className="num">{n(u.games)}</td>
      <td className="num">{n(u.achievements)}</td>
      <td className="muted admin-run">{runLabel(u.run)}</td>
      <td>
        <div className="row-actions">
          {running ? (
            <Button variant="ghost" busy={busy === `c${u.id}`} onClick={() => void act(`c${u.id}`, () => cancelSync(u.run!.id))}>
              Parar
            </Button>
          ) : (
            u.steam_id && (
              <Button variant="ghost" busy={busy === `s${u.id}`} onClick={() => void act(`s${u.id}`, () => forceSync(u.id))}>
                Forzar sincronización
              </Button>
            )
          )}
          {u.id !== me &&
            (u.is_admin ? (
              <Button variant="ghost" busy={busy === `r${u.id}`} onClick={() => void act(`r${u.id}`, () => revokeAdmin(u.id))}>
                Quitar admin
              </Button>
            ) : (
              <Button variant="ghost" busy={busy === `g${u.id}`} onClick={() => void act(`g${u.id}`, () => grantAdmin(u.id))}>
                Hacer admin
              </Button>
            ))}
        </div>
      </td>
    </tr>
  )
}
