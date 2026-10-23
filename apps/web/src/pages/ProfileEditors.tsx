import { useEffect, useRef, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { Avatar, Button } from '@pulso/ui'
import { useAuth, type Profile } from '../lib/auth.tsx'
import { searchMyLibrary, type CatalogGame } from '../lib/library.ts'
import {
  LINK_KINDS,
  linkKindFor,
  MAX_FAVORITES,
  MAX_LINKS,
  normalizeLinkUrl,
  saveFavorites,
  saveLinks,
  setProfileImage,
  uploadProfileImage,
  type ProfileImageKind,
} from '../lib/profile.ts'
import { supabase } from '../lib/supabase.ts'
import { Cover } from './Cover.tsx'
import { LinkIcon } from './ProfileLinks.tsx'

function useProfile(): { profile: Profile; refresh: () => Promise<void> } | null {
  const { state, refreshProfile } = useAuth()
  if (state.status !== 'signed-in' || !state.profile) return null
  return { profile: state.profile, refresh: refreshProfile }
}

// ───────── Avatar y banner ─────────

function ImagePicker({ kind, label, onPick }: { kind: ProfileImageKind; label: string; onPick: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <Button variant="ghost" onClick={() => input.current?.click()}>
        {label}
      </Button>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        aria-label={kind === 'avatar' ? 'Imagen de avatar' : 'Imagen de banner'}
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) onPick(file)
        }}
      />
    </>
  )
}

export function ImagesEditor() {
  const ctx = useProfile()
  const [steamAvatar, setSteamAvatar] = useState<string | null>(null)
  const [busy, setBusy] = useState<ProfileImageKind | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void supabase!
      .from('linked_accounts')
      .select('avatar_url')
      .eq('platform', 'steam')
      .maybeSingle()
      .then(({ data }) => setSteamAvatar((data as { avatar_url: string | null } | null)?.avatar_url ?? null))
  }, [])

  if (!ctx) return null
  const { profile, refresh } = ctx

  async function run(kind: ProfileImageKind, action: () => Promise<unknown>) {
    setBusy(kind)
    setError(null)
    try {
      await action()
      await refresh()
    } catch {
      setError('No se pudo guardar la imagen. Prueba con un PNG, JPG o WebP.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="settings-panel">
      <div className="banner-preview">
        {profile.banner_url ? <img src={profile.banner_url} alt="" /> : <span className="muted">Sin banner</span>}
      </div>
      <div className="row-actions">
        <ImagePicker kind="banner" label={busy === 'banner' ? 'Subiendo…' : 'Cambiar banner'} onPick={(f) => void run('banner', () => uploadProfileImage(profile.id, 'banner', f))} />
        {profile.banner_url && (
          <Button variant="ghost" onClick={() => void run('banner', () => setProfileImage(profile.id, 'banner', null))}>
            Quitar banner
          </Button>
        )}
      </div>
      <p className="muted kpi-note">Se recorta a 1500 × 500. Mejor una imagen horizontal.</p>

      <div className="avatar-row">
        <Avatar name={profile.username} src={profile.avatar_url} size={72} />
        <div className="row-actions">
          <ImagePicker kind="avatar" label={busy === 'avatar' ? 'Subiendo…' : 'Cambiar avatar'} onPick={(f) => void run('avatar', () => uploadProfileImage(profile.id, 'avatar', f))} />
          {steamAvatar && profile.avatar_url !== steamAvatar && (
            <Button variant="ghost" onClick={() => void run('avatar', () => setProfileImage(profile.id, 'avatar', steamAvatar))}>
              Usar el de Steam
            </Button>
          )}
        </div>
      </div>
      {error && <p className="notice" role="alert">{error}</p>}
    </div>
  )
}

// ───────── Enlaces ─────────

export function LinksEditor() {
  const ctx = useProfile()
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  if (!ctx) return null
  const { profile, refresh } = ctx
  const links = profile.links ?? []

  async function save(next: typeof links) {
    try {
      await saveLinks(profile.id, next)
      setError(null)
      await refresh()
    } catch {
      setError('No se pudo guardar el enlace.')
    }
  }

  function add(event: FormEvent) {
    event.preventDefault()
    const clean = normalizeLinkUrl(url)
    if (!clean) return setError('Escribe una dirección web válida, por ejemplo twitch.tv/tu-canal.')
    if (links.some((l) => l.url === clean)) return setError('Ese enlace ya está.')
    setUrl('')
    void save([...links, { kind: linkKindFor(clean), url: clean }])
  }

  return (
    <div className="settings-panel">
      {links.length > 0 && (
        <ul className="player-list">
          {links.map((link) => (
            <li key={link.url} className="player-row">
              <span className="link-chip">
                <LinkIcon kind={link.kind} />
                <span>{LINK_KINDS[link.kind]}</span>
                <span className="muted link-url">{link.url.replace(/^https:\/\//, '')}</span>
              </span>
              <button type="button" className="icon-button" aria-label={`Quitar ${LINK_KINDS[link.kind]}`} onClick={() => void save(links.filter((l) => l !== link))}>
                <X size={14} strokeWidth={1.5} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {links.length < MAX_LINKS ? (
        <form className="tag-form" onSubmit={add}>
          <input value={url} placeholder="twitch.tv/tu-canal, youtube.com/@tu-canal…" aria-label="Nuevo enlace" onChange={(e) => setUrl(e.target.value)} />
          <Button type="submit" variant="ghost">
            Añadir
          </Button>
        </form>
      ) : (
        <p className="muted">Has llegado al máximo de {MAX_LINKS} enlaces.</p>
      )}
      {error && <p className="notice" role="alert">{error}</p>}
    </div>
  )
}

// ───────── Juegos favoritos ─────────

export function FavoritesEditor() {
  const ctx = useProfile()
  const [games, setGames] = useState<Map<number, Pick<CatalogGame, 'name' | 'cover_url'>>>(new Map())
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<CatalogGame[]>([])
  const [error, setError] = useState<string | null>(null)
  const ids = ctx?.profile.favorite_game_ids ?? []

  useEffect(() => {
    if (ids.length === 0) return
    void supabase!
      .from('games')
      .select('id, name, cover_url')
      .in('id', ids)
      .then(({ data }) => setGames(new Map(((data ?? []) as (Pick<CatalogGame, 'name' | 'cover_url'> & { id: number })[]).map((g) => [g.id, g]))))
  }, [ids.join(',')])

  useEffect(() => {
    if (!ctx || term.trim().length < 2) return setResults([])
    const handle = setTimeout(() => void searchMyLibrary(ctx.profile.id, term, 6).then(setResults), 300)
    return () => clearTimeout(handle)
  }, [term, ctx?.profile.id])

  if (!ctx) return null
  const { profile, refresh } = ctx

  async function save(next: number[]) {
    try {
      await saveFavorites(profile.id, next)
      setError(null)
      await refresh()
    } catch {
      setError('No se pudieron guardar los favoritos.')
    }
  }

  return (
    <div className="settings-panel">
      {ids.length > 0 ? (
        <ul className="favorites-edit">
          {ids.map((id) => {
            const game = games.get(id)
            return (
              <li key={id}>
                <Cover game={game ?? { name: '…', cover_url: null }} />
                <button type="button" className="link-button cover-meta" onClick={() => void save(ids.filter((x) => x !== id))}>
                  Quitar
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="muted">Elige hasta {MAX_FAVORITES} juegos de tu biblioteca para enseñarlos en tu perfil.</p>
      )}
      {ids.length < MAX_FAVORITES && (
        <>
          <input className="search" type="search" placeholder="Busca en tu biblioteca" aria-label="Añadir favorito" value={term} onChange={(e) => setTerm(e.target.value)} />
          {results.length > 0 && (
            <ul className="catalog-results">
              {results.map((game) => (
                <li key={game.id} className="catalog-row">
                  <Cover game={game} small />
                  <span className="catalog-name catalog-meta">{game.name}</span>
                  {ids.includes(game.id) ? (
                    <span className="pill">Ya está</span>
                  ) : (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setTerm('')
                        void save([...ids, game.id])
                      }}
                    >
                      Añadir
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {error && <p className="notice" role="alert">{error}</p>}
    </div>
  )
}
