import type { CatalogGame } from '../lib/library.ts'

/** La portada del juego, o su nombre sobre un panel si IGDB no tiene portada. */
export function Cover({ game, small = false }: { game: Pick<CatalogGame, 'name' | 'cover_url'>; small?: boolean }) {
  const cls = small ? 'cover cover-small' : 'cover'
  if (!game.cover_url) {
    return (
      <span className={`${cls} cover-missing`} aria-hidden="true">
        {small ? game.name.charAt(0) : game.name}
      </span>
    )
  }
  const src = small ? game.cover_url.replace('/t_cover_big/', '/t_thumb/') : game.cover_url
  return <img className={cls} src={src} alt="" loading="lazy" decoding="async" />
}
