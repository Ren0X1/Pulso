import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { PRIVACY_LABELS } from '@pulso/core'
import { STATUS_LABELS, type LibraryEntry } from '../lib/library.ts'
import type { GameList } from '../lib/lists.ts'
import { supabase } from '../lib/supabase.ts'
import { Cover } from './Cover.tsx'

type Entry = Pick<LibraryEntry, 'game_id' | 'status' | 'favorite' | 'game'>

/**
 * Lo que este jugador deja ver de su biblioteca y sus listas. La base de datos aplica la privacidad:
 * si no devuelve filas, puede ser porque no hay o porque no tienes permiso, y la pantalla lo dice así.
 */
export function ProfileShowcase({
  userId,
  isMe,
  platinums,
  favorites,
}: {
  userId: string
  isMe: boolean
  platinums: Set<number>
  favorites: number[]
}) {
  const [favoriteGames, setFavoriteGames] = useState<Entry['game'][]>([])
  useEffect(() => {
    if (favorites.length === 0) return setFavoriteGames([])
    void supabase!
      .from('games')
      .select('id, name, slug, summary, release_date, cover_url, genres, platforms')
      .in('id', favorites)
      .then(({ data }) => {
        // En el orden que eligió el jugador.
        const byId = new Map(((data ?? []) as Entry['game'][]).map((g) => [g.id, g]))
        setFavoriteGames(favorites.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])))
      })
  }, [favorites.join(',')])
  const [games, setGames] = useState<{ rows: Entry[]; total: number } | null>(null)
  const [lists, setLists] = useState<GameList[]>([])

  useEffect(() => {
    void supabase!
      .from('user_games')
      .select('game_id, status, favorite, game:games!inner(id, name, slug, summary, release_date, cover_url, genres, platforms)', {
        count: 'exact',
      })
      .eq('user_id', userId)
      .order('favorite', { ascending: false })
      .order('added_at', { ascending: false })
      .limit(12)
      .then(({ data, count }) => setGames({ rows: (data ?? []) as unknown as Entry[], total: count ?? 0 }))
    void supabase!
      .from('game_lists')
      .select('id, owner_id, name, description, visibility, created_at, items:game_list_items(count)')
      .eq('owner_id', userId)
      .neq('visibility', 'private')
      .order('created_at', { ascending: false })
      .then(({ data }) => setLists((data ?? []) as GameList[]))
  }, [userId])

  const [platinumGames, setPlatinumGames] = useState<Entry['game'][]>([])
  useEffect(() => {
    if (platinums.size === 0) return setPlatinumGames([])
    void supabase!
      .from('games')
      .select('id, name, slug, summary, release_date, cover_url, genres, platforms')
      .in('id', [...platinums])
      .order('name')
      .limit(24)
      .then(({ data }) => setPlatinumGames((data ?? []) as Entry['game'][]))
  }, [platinums])

  if (!games) return null

  return (
    <>
      {favoriteGames.length > 0 && (
        <section className="panel" aria-label="Favoritos">
          <h2 className="panel-title">Favoritos</h2>
          <ul className="cover-grid cover-grid-row">
            {favoriteGames.map((g) => (
              <li key={g.id} className="cover-card">
                <Cover game={g} platinum={platinums.has(g.id)} />
                <span className="cover-name">{g.name}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {platinumGames.length > 0 && (
        <section className="panel" aria-label="Platinos">
          <h2 className="panel-title name-row">
            Platinos <span className="count num">{platinums.size}</span>
          </h2>
          <p className="muted kpi-note platinum-note">Juegos con todos sus logros de Steam conseguidos.</p>
          <ul className="cover-grid">
            {platinumGames.map((g) => (
              <li key={g.id} className="cover-card">
                <Cover game={g} platinum />
                <span className="cover-name">{g.name}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel" aria-label="Biblioteca">
        <div className="panel-title-row">
          <h2 className="panel-title">
            Biblioteca <span className="count num">{games.total}</span>
          </h2>
          {isMe && games.total > 0 && <Link to="/biblioteca">Ver toda</Link>}
        </div>
        {games.rows.length === 0 ? (
          <p className="muted">
            {isMe ? 'Tu biblioteca está vacía. Añade juegos desde Biblioteca.' : 'No hay juegos que puedas ver: su biblioteca está vacía o es privada.'}
          </p>
        ) : (
          <ul className="cover-grid">
            {games.rows.map((e) => (
              <li key={e.game_id} className="cover-card">
                <Cover game={e.game} platinum={platinums.has(e.game_id)} />
                <span className="cover-name">{e.game.name}</span>
                <span className="cover-meta">
                  {STATUS_LABELS[e.status]}
                  {e.favorite && ' · Favorito'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {lists.length > 0 && (
        <section className="panel" aria-label="Listas">
          <h2 className="panel-title">Listas</h2>
          <ul className="player-list">
            {lists.map((l) => (
              <li key={l.id} className="player-row">
                <Link to={`/listas/${l.id}`} className="player-link">
                  {l.name}
                </Link>
                <span className="muted num">
                  {l.items[0]?.count ?? 0} juegos · {PRIVACY_LABELS[l.visibility]}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
