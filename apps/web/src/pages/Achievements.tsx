import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../lib/auth.tsx'
import { loadProgress, loadRecentUnlocks, type GameProgress, type UnlockedAchievement } from '../lib/achievements.ts'
import { formatAgo, rarityLabel } from '../lib/steam.ts'
import { Cover } from './Cover.tsx'
import { SyncSteam } from './SyncSteam.tsx'

const percent = (p: GameProgress) => Math.round((p.unlocked / p.total) * 100)

export function AchievementsPage() {
  const { state } = useAuth()
  const me = state.status === 'signed-in' ? state.session.user.id : ''
  const [progress, setProgress] = useState<GameProgress[] | null>(null)
  const [recent, setRecent] = useState<UnlockedAchievement[]>([])
  const [failed, setFailed] = useState(false)

  const reload = useCallback(async () => {
    try {
      const [p, r] = await Promise.all([loadProgress(me), loadRecentUnlocks(me)])
      setProgress(p)
      setRecent(r)
    } catch {
      setFailed(true)
    }
  }, [me])

  useEffect(() => {
    void reload()
  }, [reload])

  const totalUnlocked = progress?.reduce((sum, p) => sum + p.unlocked, 0) ?? 0
  const perfect = progress?.filter((p) => p.unlocked === p.total).length ?? 0

  return (
    <div className="stack">
      <section className="panel">
        <div className="kpis">
          <div>
            <p className="kpi-label">Logros conseguidos</p>
            <p className="kpi-value num">{progress ? totalUnlocked.toLocaleString('es') : '—'}</p>
          </div>
          <div>
            <p className="kpi-label">Juegos con logros</p>
            <p className="kpi-value num">{progress ? progress.length : '—'}</p>
          </div>
          <div>
            <p className="kpi-label">Completados al 100 %</p>
            <p className="kpi-value num">{progress ? perfect : '—'}</p>
          </div>
        </div>
        <SyncSteam onSynced={() => void reload()} />
        <p className="muted kpi-note">
          Solo cuentan los logros verificados en Steam. Cada sincronización revisa 25 juegos más, empezando por los que has
          jugado últimamente.
        </p>
      </section>

      {failed && <p className="notice" role="alert">No se pudieron cargar tus logros.</p>}

      {progress?.length === 0 && (
        <section className="empty">
          <h2>Aún no hay logros</h2>
          <p>Sincroniza con Steam para importar los logros de tus juegos.</p>
        </section>
      )}

      {recent.length > 0 && (
        <section className="panel" aria-label="Logros recientes">
          <h2 className="panel-title">Recientes</h2>
          <ul className="ach-list">
            {recent.map((u) => (
              <li key={u.achievement.id} className="ach-row">
                {u.achievement.icon_url && <img className="ach-icon" src={u.achievement.icon_url} alt="" loading="lazy" />}
                <div className="ach-meta">
                  <span className="ach-name">{u.achievement.name}</span>
                  <span className="muted">
                    {u.achievement.game.name}
                    {u.unlocked_at && ` · ${formatAgo(u.unlocked_at)}`}
                  </span>
                </div>
                {u.achievement.global_percent !== null && (
                  <span className="ach-rarity num" title={`${u.achievement.global_percent} % de los jugadores de Steam lo tiene`}>
                    {rarityLabel(u.achievement.global_percent)} · {u.achievement.global_percent.toLocaleString('es')} %
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {progress && progress.length > 0 && (
        <section className="panel" aria-label="Progreso por juego">
          <h2 className="panel-title">Progreso por juego</h2>
          <ul className="ach-list">
            {progress.map((p) => (
              <li key={p.game_id} className="ach-row">
                <Cover game={p.game} small />
                <div className="ach-meta">
                  <span className="ach-name">{p.game.name}</span>
                  <div className="bar" role="img" aria-label={`${percent(p)} %`}>
                    <span style={{ width: `${percent(p)}%` }} />
                  </div>
                </div>
                <span className="num ach-count">
                  {p.unlocked} <span className="muted">/ {p.total}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
