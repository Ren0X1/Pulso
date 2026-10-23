import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { Avatar } from '@pulso/ui'
import { useAuth } from '../lib/auth.tsx'
import { formatPlaytime, type CatalogGame } from '../lib/library.ts'
import { compareLibraries, loadComparable, type CommonGame } from '../lib/social.ts'
import { supabase } from '../lib/supabase.ts'
import { Cover } from './Cover.tsx'
import { EmptyState } from './EmptyState.tsx'
import { PlatinumBadge } from './Platinum.tsx'

interface Player {
  id: string
  username: string
  avatar_url: string | null
}

function Achievements({ unlocked, total }: { unlocked: number | null; total: number | null }) {
  if (unlocked === null || total === null) return <span className="muted">—</span>
  return (
    <span className="num">
      {unlocked}/{total} {unlocked === total && <PlatinumBadge />}
    </span>
  )
}

export function ComparePage() {
  const { username = '' } = useParams()
  const { state } = useAuth()
  const me = state.status === 'signed-in' ? state.session.user.id : ''
  const myName = state.status === 'signed-in' ? (state.profile?.username ?? 'Tú') : 'Tú'
  const [other, setOther] = useState<Player | null | undefined>(undefined)
  const [result, setResult] = useState<ReturnType<typeof compareLibraries> | null>(null)
  const [games, setGames] = useState<Map<number, Pick<CatalogGame, 'name' | 'cover_url'>>>(new Map())
  const [platinums, setPlatinums] = useState<[number, number]>([0, 0])

  useEffect(() => {
    void (async () => {
      const { data } = await supabase!.from('profiles').select('id, username, avatar_url').eq('username', username.toLowerCase()).maybeSingle()
      const found = (data as Player | null) ?? null
      setOther(found)
      if (!found) return
      const [mine, theirs] = await Promise.all([loadComparable(me), loadComparable(found.id)])
      const compared = compareLibraries(mine.games, theirs.games, mine.progress, theirs.progress)
      setResult(compared)
      const count = (rows: { unlocked: number; total: number }[]) => rows.filter((r) => r.total > 0 && r.unlocked === r.total).length
      setPlatinums([count(mine.progress), count(theirs.progress)])
      const ids = compared.common.slice(0, 100).map((c) => c.game_id)
      if (ids.length) {
        const { data: rows } = await supabase!.from('games').select('id, name, cover_url').in('id', ids)
        setGames(new Map(((rows ?? []) as (Pick<CatalogGame, 'name' | 'cover_url'> & { id: number })[]).map((g) => [g.id, g])))
      }
    })()
  }, [username, me])

  if (other === undefined || (other && !result)) return <p className="muted">Comparando…</p>
  if (other === null) return <EmptyState title="Este jugador no existe">No hay nadie en Pulso con ese nombre.</EmptyState>

  const common: CommonGame[] = result!.common.slice(0, 100)
  return (
    <div className="stack">
      <section className="panel">
        <div className="versus">
          <div className="versus-side">
            <span className="profile-name">{myName}</span>
            <span className="muted num">{platinums[0]} platinos</span>
          </div>
          <span className="versus-vs">vs</span>
          <Link to={`/u/${other.username}`} className="versus-side versus-right">
            <Avatar name={other.username} src={other.avatar_url} size={40} />
            <span className="profile-name">{other.username}</span>
            <span className="muted num">{platinums[1]} platinos</span>
          </Link>
        </div>
        <div className="kpis compare-kpis">
          <div>
            <p className="kpi-label">Juegos en común</p>
            <p className="kpi-value num">{result!.common.length}</p>
          </div>
          <div>
            <p className="kpi-label">Solo tú</p>
            <p className="kpi-value num">{result!.onlyMine}</p>
          </div>
          <div>
            <p className="kpi-label">Solo {other.username}</p>
            <p className="kpi-value num">{result!.onlyTheirs}</p>
          </div>
        </div>
        <p className="muted kpi-note">Solo cuenta lo que {other.username} deja ver con su privacidad.</p>
      </section>

      {common.length === 0 ? (
        <EmptyState title="Ningún juego en común">O su biblioteca es privada para ti.</EmptyState>
      ) : (
        <section className="panel" aria-label="Juegos en común">
          <table className="library-table compare-table">
            <thead>
              <tr>
                <th>Juego</th>
                <th className="num">Tus horas</th>
                <th className="num">Sus horas</th>
                <th className="num">Tus logros</th>
                <th className="num">Sus logros</th>
              </tr>
            </thead>
            <tbody>
              {common.map((c) => {
                const game = games.get(c.game_id)
                return (
                  <tr key={c.game_id}>
                    <td>
                      <span className="row-game">
                        <Cover game={game ?? { name: '?', cover_url: null }} small />
                        <span>{game?.name ?? '…'}</span>
                      </span>
                    </td>
                    <td className="num">{formatPlaytime(c.mine.minutes)}</td>
                    <td className="num">{formatPlaytime(c.theirs.minutes)}</td>
                    <td className="num">
                      <Achievements {...c.mine} />
                    </td>
                    <td className="num">
                      <Achievements {...c.theirs} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}
