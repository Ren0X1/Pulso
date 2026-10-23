import { useState } from 'react'
import type { CatalogGame } from '../lib/library.ts'
import { PlatinumBadge } from './Platinum.tsx'

/** Si un juego de Steam no tiene portada vertical, su cabecera horizontal es la siguiente mejor opción. */
export function coverFallback(src: string): string | null {
  return src.includes('/library_600x900.jpg') ? src.replace('/library_600x900.jpg', '/header.jpg') : null
}

/** La portada del juego, o su nombre sobre un panel si no hay ninguna imagen que cargue. */
export function Cover({
  game,
  small = false,
  platinum = false,
}: {
  game: Pick<CatalogGame, 'name' | 'cover_url'>
  small?: boolean
  platinum?: boolean
}) {
  const initial = game.cover_url && small ? game.cover_url.replace('/t_cover_big/', '/t_thumb/') : game.cover_url
  const [src, setSrc] = useState(initial)
  const cls = small ? 'cover cover-small' : 'cover'

  const image = !src ? (
    <span className={`${cls} cover-missing`} aria-hidden="true">
      {small ? game.name.charAt(0) : game.name}
    </span>
  ) : (
    <img className={cls} src={src} alt="" loading="lazy" decoding="async" onError={() => setSrc(coverFallback(src))} />
  )

  if (!platinum || small) return image
  return (
    <span className="cover-wrap">
      {image}
      <PlatinumBadge variant="cover" />
    </span>
  )
}
