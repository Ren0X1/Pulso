import { useEffect, useState } from 'react'
import { loadGameAchievements, type GameAchievement } from '../lib/achievements.ts'
import { rarityLabel } from '../lib/steam.ts'
import { PlatinumBadge } from './Platinum.tsx'

export function GameAchievements({ userId, gameId }: { userId: string; gameId: number }) {
  const [list, setList] = useState<GameAchievement[] | null>(null)

  useEffect(() => {
    setList(null)
    void loadGameAchievements(userId, gameId).then(setList, () => setList([]))
  }, [userId, gameId])

  if (list === null) return <p className="muted">Cargando logros…</p>
  if (list.length === 0) {
    return <p className="muted">Sin logros importados: el juego no tiene logros en Steam o aún no se han revisado.</p>
  }

  const unlocked = list.filter((a) => a.unlocked_at !== undefined).length
  return (
    <div className="game-ach">
      <p className="field-label num name-row">
        <span>
          Logros {unlocked} <span className="muted">/ {list.length}</span>
        </span>
        {unlocked === list.length && (
          <span className="platinum-count">
            <PlatinumBadge /> Platino
          </span>
        )}
      </p>
      <div className="bar" role="img" aria-label={`${Math.round((unlocked / list.length) * 100)} %`}>
        <span style={{ width: `${(unlocked / list.length) * 100}%` }} />
      </div>
      <ul className="ach-list ach-list-compact">
        {list.map((a) => {
          const got = a.unlocked_at !== undefined
          const secret = a.hidden && !got
          return (
            <li key={a.id} className="ach-row" data-locked={got ? undefined : ''}>
              <img className="ach-icon" src={(got ? a.icon_url : a.icon_locked_url) ?? ''} alt="" loading="lazy" />
              <div className="ach-meta">
                <span className="ach-name">{secret ? 'Logro oculto' : a.name}</span>
                {!secret && a.description && <span className="muted">{a.description}</span>}
              </div>
              {a.global_percent !== null && (
                <span className="ach-rarity num">
                  {rarityLabel(a.global_percent)} · {a.global_percent.toLocaleString('es')} %
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
