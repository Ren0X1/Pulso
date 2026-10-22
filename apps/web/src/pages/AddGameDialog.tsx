import { useEffect, useState } from 'react'
import { Button } from '@pulso/ui'
import { addToLibrary, searchCatalog, type CatalogError, type CatalogGame } from '../lib/library.ts'
import { supabase } from '../lib/supabase.ts'
import { Cover } from './Cover.tsx'
import { Dialog } from './Dialog.tsx'

const CATALOG_ERRORS: Record<CatalogError, string> = {
  term_too_short: 'Escribe al menos 2 letras.',
  catalog_not_configured: 'El catálogo aún no está configurado (faltan las credenciales de IGDB).',
  catalog_unavailable: 'El catálogo de IGDB no responde ahora mismo. Inténtalo en un momento.',
  not_signed_in: 'Tu sesión ha caducado. Vuelve a entrar.',
}

export function AddGameDialog({
  open,
  userId,
  onClose,
  onAdded,
}: {
  open: boolean
  userId: string
  onClose: () => void
  onAdded: () => void
}) {
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<CatalogGame[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [owned, setOwned] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState<number | null>(null)

  useEffect(() => {
    if (!open) return
    setTerm('')
    setResults(null)
    setError(null)
  }, [open])

  useEffect(() => {
    if (term.trim().length < 2) {
      setResults(null)
      return
    }
    setLoading(true)
    const handle = setTimeout(async () => {
      const res = await searchCatalog(term)
      setLoading(false)
      if ('error' in res) {
        setError(CATALOG_ERRORS[res.error])
        setResults(null)
        return
      }
      setError(null)
      setResults(res.games)
      const ids = res.games.map((g) => g.id)
      if (ids.length) {
        const { data } = await supabase!.from('user_games').select('game_id').eq('user_id', userId).in('game_id', ids)
        setOwned(new Set(((data ?? []) as { game_id: number }[]).map((r) => r.game_id)))
      }
    }, 400)
    return () => clearTimeout(handle)
  }, [term, userId])

  async function add(game: CatalogGame) {
    setBusy(game.id)
    try {
      await addToLibrary(userId, game.id)
      setOwned((prev) => new Set(prev).add(game.id))
      onAdded()
    } catch {
      setError('No se pudo añadir. Inténtalo de nuevo.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog open={open} title="Añadir juego" onClose={onClose} wide>
      <input
        className="search search-large"
        type="search"
        autoFocus
        placeholder="Busca cualquier juego: Half-Life, Tetris, Elden Ring…"
        aria-label="Buscar en el catálogo"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
      />
      <p className="muted catalog-credit">Catálogo de IGDB · de los clásicos a los últimos lanzamientos</p>
      {error && <p className="notice" role="alert">{error}</p>}
      {loading && <p className="muted">Buscando…</p>}
      {!loading && results?.length === 0 && <p className="muted">Ningún juego con ese nombre.</p>}
      {results && results.length > 0 && (
        <ul className="catalog-results">
          {results.map((game) => (
            <li key={game.id} className="catalog-row">
              <Cover game={game} small />
              <div className="catalog-meta">
                <span className="catalog-name">{game.name}</span>
                <span className="muted">
                  {[game.release_date?.slice(0, 4), game.platforms.slice(0, 4).join(' · ')].filter(Boolean).join(' — ')}
                </span>
              </div>
              {owned.has(game.id) ? (
                <span className="pill">En tu biblioteca</span>
              ) : (
                <Button variant="ghost" busy={busy === game.id} onClick={() => void add(game)}>
                  Añadir
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  )
}
