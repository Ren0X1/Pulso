import { Award } from 'lucide-react'

/** Insignia de platino: todos los logros de Steam del juego conseguidos. */
export function PlatinumBadge({ variant = 'inline' }: { variant?: 'inline' | 'cover' }) {
  return (
    <span className={`platinum platinum-${variant}`} role="img" aria-label="Platino: todos los logros" title="Platino: todos los logros">
      <Award size={variant === 'cover' ? 14 : 12} strokeWidth={2} aria-hidden="true" />
    </span>
  )
}

/** "19 platinos" junto al nombre del jugador. */
export function PlatinumCount({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <span className="platinum-count num" title="Juegos con todos los logros de Steam">
      <Award size={14} strokeWidth={2} aria-hidden="true" />
      {count} {count === 1 ? 'platino' : 'platinos'}
    </span>
  )
}
